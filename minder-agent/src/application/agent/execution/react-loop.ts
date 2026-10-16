import type { JsonValue, WorkspacePath } from "@domain/index.js";
import type {
  ModelMessage,
  ModelToolDefinition,
} from "@application/shared/ports/index.js";
import type { AgentLoopOutcome } from "./completion.js";
import { type AgentLifecycleEvent, TURN_BREAK } from "./lifecycle.js";
import type { PauseRequest } from "./pause.js";
import type {
  AgentLoop,
  AgentLoopExecution,
  AgentLoopInput,
  AgentLoopServices,
} from "./loop.js";
import { DoomLoopDetector } from "../policy/doom-loop-detector.js";
import {
  appendDelta,
  beginModelTurn,
  finalizeModelTurn,
} from "./stream-assembly.js";
import { continueLoopSnapshot, repairTranscript } from "./react-loop-state.js";
import {
  assessWorkSafety,
  resetOwnedInProgressTodos,
} from "../context/context.js";
import { type AssembledToolCall, dispatchToolCalls } from "./tool-dispatch.js";
import { pauseForCall, pauseMessage } from "./loop-pauses.js";
import {
  rememberEffects,
  restoredContinuation,
  restoredSnapshot,
  restoredValues,
} from "./loop-outcomes.js";

export interface ReactLoopResult {
  readonly events: readonly AgentLifecycleEvent[];
  readonly outcome: AgentLoopOutcome;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0))
      waiter({ done: true, value: undefined });
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const value = this.values.shift();
      if (value !== undefined) {
        yield value;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) =>
        this.waiters.push(resolve),
      );
      if (next.done) return;
      yield next.value;
    }
  }
}

interface AssembledTurn {
  readonly text: string;
  readonly toolCalls: readonly AssembledToolCall[];
  readonly truncated: boolean;
}

const AUTONOMOUS_PROMPT =
  "You are an autonomous background worker agent. Complete the task end to end using tools when they help, then finish with a concise result. Never ask for confirmation.";
const INTERACTIVE_PROMPT =
  "You are an interactive assistant. Use tools when they help. Use AskUser only when a material ambiguity genuinely requires the human. Finish with a concise answer.";
const SKILL_DISCOVERY_PROMPT =
  "Before starting task work or using task tools, first use ListSkills to discover available skills. If a skill applies, load it with InvokeSkill and follow its instructions. If skill discovery tools are unavailable or no skill applies, proceed normally. For report artifact requests, use the pdf-report skill to create and publish a real PDF by default, even when the user says only to create a report. Use Markdown only when explicitly requested. This rule overrides older manifest instructions that make Markdown the default; if the skill or required tools are unavailable, explain that instead of substituting Markdown.";

function toDefinitions(
  tools: AgentLoopServices["tools"],
  clientTools: readonly NonNullable<AgentLoopServices["clientTools"]>[number][],
  includePlanReview: boolean,
): ModelToolDefinition[] {
  const definitions = tools.map((tool) => ({
    name: tool.descriptor.name,
    description: tool.descriptor.description,
    parameters: tool.descriptor.parameters,
  }));
  definitions.push(
    ...clientTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  );
  if (includePlanReview) definitions.push(PROPOSE_PLAN_DEFINITION);
  return definitions;
}

const PROPOSE_PLAN_DEFINITION: ModelToolDefinition = {
  name: "ProposePlan",
  description:
    "Propose an all-or-nothing multi-step plan for human review before executing it.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string" },
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            tool_name: { type: "string" },
            arguments: {},
            rationale: { type: "string" },
          },
          required: ["tool_name", "arguments", "rationale"],
        },
      },
    },
    required: ["steps"],
  },
};

function taskCompletion(
  call: AssembledToolCall,
): { readonly summary: string; readonly status: string } | undefined {
  if (call.name !== "TaskStop" && call.name !== "task_complete")
    return undefined;
  const args = call.arguments;
  const record =
    typeof args === "object" && args !== null && !Array.isArray(args)
      ? (args as Record<string, JsonValue>)
      : {};
  const summary =
    typeof record.result === "string"
      ? record.result
      : typeof record.summary === "string"
        ? record.summary
        : "Task completed";
  const status = typeof record.status === "string" ? record.status : "success";
  return { summary, status };
}

/**
 * The executable ReAct loop as a real-time async generator. Yields fine-grained
 * lifecycle events (`stream_delta` per model delta, `tool_result` per dispatched
 * tool) so a consumer can reconstruct a live event stream, and ends with a
 * terminal `completed | failed | paused` event carrying `{ outcome }`.
 */
async function* reactLoopEvents(
  input: AgentLoopInput,
  signal: AbortSignal,
): AsyncGenerator<AgentLifecycleEvent, AgentLoopOutcome, void> {
  const terminal = function* (
    outcome: AgentLoopOutcome,
  ): Generator<AgentLifecycleEvent> {
    const type: AgentLifecycleEvent["type"] =
      outcome.kind === "paused"
        ? "paused"
        : outcome.kind === "failed"
          ? "failed"
          : outcome.kind === "interrupted"
            ? "interrupted"
            : outcome.kind === "backgrounded"
              ? "backgrounded"
              : "completed";
    yield { type, data: { outcome } as unknown as JsonValue };
  };

  if (signal.aborted) {
    const outcome: AgentLoopOutcome = { kind: "interrupted", text: "" };
    yield* terminal(outcome);
    return outcome;
  }

  const { model, tools, clientTools, approvalGate } = input.services;
  const continuation = restoredContinuation(input);
  const continuedSnapshot =
    continuation === undefined ? undefined : continueLoopSnapshot(continuation);
  const snapshot = continuedSnapshot ?? restoredSnapshot(input);
  const systemPrompt = [
    input.systemPrompt ??
      (input.run.mode === "interactive"
        ? INTERACTIVE_PROMPT
        : AUTONOMOUS_PROMPT),
    SKILL_DISCOVERY_PROMPT,
  ].join("\n\n");
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    ...repairTranscript(
      continuedSnapshot === undefined
        ? (input.history ?? [{ role: "user", content: input.run.input }])
        : continuedSnapshot.messages,
    ),
  ];
  const definitions = toDefinitions(
    tools,
    clientTools ?? [],
    input.includePlanReview ?? input.run.mode === "interactive",
  );
  const detector = new DoomLoopDetector(
    input.policy.doomLoop.maxRepeatedToolCalls,
  );
  const workspace = (input.session?.id ?? "") as WorkspacePath;
  let text = "";
  let todoNudges = 0;
  const activatedTools = new Set(
    (snapshot?.activatedTools ?? []).filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    ),
  );
  const todos = new Map(
    restoredValues(snapshot?.todos).map((todo) => [
      todo.id,
      structuredClone(todo),
    ]),
  );
  const backgroundTasks = new Map(
    restoredValues(snapshot?.backgroundTasks).map((task) => [
      task.id,
      structuredClone(task),
    ]),
  );

  for (
    let iteration = 0;
    iteration < input.policy.maxIterations;
    iteration += 1
  ) {
    if (signal.aborted) {
      const outcome: AgentLoopOutcome = {
        kind: "interrupted",
        text,
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: resetOwnedInProgressTodos([...todos.values()]),
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }
    yield { type: "iteration", data: { iteration } };
    yield { type: "model_started", data: { iteration } };

    let turnText = "";
    let assembly = beginModelTurn();
    try {
      for await (const delta of model.stream(
        { model: "", messages, tools: definitions },
        signal,
      )) {
        assembly = appendDelta(assembly, delta);
        if (delta.text) {
          // Text that follows an earlier turn's text starts a new paragraph:
          // the sentence the model wrote before calling tools and the answer
          // it writes after them would otherwise run together.
          if (turnText === "" && text !== "" && !text.endsWith(TURN_BREAK)) {
            text += TURN_BREAK;
            yield {
              type: "stream_delta",
              data: { text: TURN_BREAK, turnBreak: true },
            };
          }
          turnText += delta.text;
          yield {
            type: "stream_delta",
            data: { text: delta.text },
          };
        }
        if (delta.reasoning) {
          yield {
            type: "stream_delta",
            data: { reasoning: delta.reasoning },
          };
        }
        if (delta.usage) {
          yield {
            type: "stream_delta",
            data: { usage: delta.usage },
          };
        }
      }
    } catch (error) {
      const outcome: AgentLoopOutcome = {
        kind: signal.aborted ? "interrupted" : "failed",
        text: text + turnText,
        error: error instanceof Error ? error.message : "model stream failed",
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: resetOwnedInProgressTodos([...todos.values()]),
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }
    text += turnText;
    yield { type: "model_finished", data: { iteration } };

    const assembled = finalizeModelTurn(assembly);
    const turn: AssembledTurn = {
      text: turnText,
      toolCalls: assembled.toolCalls.map((call): AssembledToolCall => ({
        id: call.id,
        name: call.name,
        arguments: call.parsedArguments ?? {},
        rawArguments: call.rawArguments,
        ...(call.extraContent === undefined
          ? {}
          : { extraContent: call.extraContent }),
      })),
      truncated: assembled.finishReason === "length",
    };

    if (turn.toolCalls.length === 0) {
      const followUps = input.followUp?.() ?? [];
      if (followUps.length > 0) {
        for (const followUp of followUps)
          messages.push({ role: "user", content: followUp });
        continue;
      }
      messages.push({ role: "assistant", content: turn.text });
      const workSafety = assessWorkSafety({
        todos: [...todos.values()],
        backgroundTasks: [...backgroundTasks.values()],
      });
      if (workSafety.kind === "wait_for_todos" && todoNudges < 2) {
        todoNudges += 1;
        messages.push({
          role: "user",
          content: `Todo ${workSafety.todoIds.join(", ")} remains in progress. Continue working or update its status before completing.`,
        });
        continue;
      }
      if (workSafety.kind === "wait_for_todos") {
        const outcome: AgentLoopOutcome = {
          kind: "failed",
          text,
          error: `Cannot complete while todo${workSafety.todoIds.length === 1 ? "" : "s"} ${workSafety.todoIds.join(", ")} remain in progress.`,
          snapshot: {
            version: 1,
            iteration: iteration + 1,
            messages: structuredClone(messages),
            activatedTools: [...activatedTools],
            todos: resetOwnedInProgressTodos([...todos.values()]),
            backgroundTasks: [...backgroundTasks.values()],
          },
        };
        yield* terminal(outcome);
        return outcome;
      }
      if (workSafety.kind === "background") {
        const outcome: AgentLoopOutcome = {
          kind: "backgrounded",
          text,
          snapshot: {
            version: 1,
            iteration: iteration + 1,
            messages: structuredClone(messages),
            activatedTools: [...activatedTools],
            todos: [...todos.values()],
            backgroundTasks: [...backgroundTasks.values()],
          },
        };
        yield* terminal(outcome);
        return outcome;
      }
      const outcome: AgentLoopOutcome = {
        kind: "completed",
        text,
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: [...todos.values()],
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }

    const completion = turn.toolCalls
      .map(taskCompletion)
      .find(
        (
          value,
        ): value is { readonly summary: string; readonly status: string } =>
          value !== undefined,
      );
    if (completion) {
      const workSafety = assessWorkSafety({
        todos: [...todos.values()],
        backgroundTasks: [...backgroundTasks.values()],
      });
      if (workSafety.kind === "wait_for_todos" && todoNudges < 2) {
        todoNudges += 1;
        messages.push({
          role: "user",
          content: `Todo ${workSafety.todoIds.join(", ")} remains in progress. Continue working or update its status before completing.`,
        });
        continue;
      }
      if (workSafety.kind === "wait_for_todos") {
        const outcome: AgentLoopOutcome = {
          kind: "failed",
          text,
          error: `Cannot complete while todo${workSafety.todoIds.length === 1 ? "" : "s"} ${workSafety.todoIds.join(", ")} remain in progress.`,
          snapshot: {
            version: 1,
            iteration: iteration + 1,
            messages: structuredClone(messages),
            activatedTools: [...activatedTools],
            todos: resetOwnedInProgressTodos([...todos.values()]),
            backgroundTasks: [...backgroundTasks.values()],
          },
        };
        yield* terminal(outcome);
        return outcome;
      }
      if (workSafety.kind === "background") {
        const outcome: AgentLoopOutcome = {
          kind: "backgrounded",
          text,
          snapshot: {
            version: 1,
            iteration: iteration + 1,
            messages: structuredClone(messages),
            activatedTools: [...activatedTools],
            todos: [...todos.values()],
            backgroundTasks: [...backgroundTasks.values()],
          },
        };
        yield* terminal(outcome);
        return outcome;
      }
      const outcome: AgentLoopOutcome = {
        kind: "completed",
        text: turn.text.trim() ? text : completion.summary,
        completionStatus: completion.status,
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: [...todos.values()],
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }

    let pauseIndex = -1;
    let pause: PauseRequest | undefined;
    for (const [index, call] of turn.toolCalls.entries()) {
      const candidate = await pauseForCall(
        call,
        clientTools,
        tools,
        approvalGate,
      );
      if (candidate) {
        pauseIndex = index;
        pause = candidate;
        break;
      }
    }
    if (pauseIndex >= 0) {
      if (!pause) throw new Error("unreachable: pause was validated");
      messages.push({
        role: "assistant",
        content: turn.text,
        toolCalls: turn.toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          ...(call.extraContent === undefined
            ? {}
            : { extraContent: call.extraContent }),
        })),
      });
      const callsBeforePause = turn.toolCalls.slice(0, pauseIndex);
      if (callsBeforePause.length > 0) {
        yield* announceDispatch(callsBeforePause);
        const results = await dispatchToolCalls(
          callsBeforePause,
          tools,
          { workspace, signal, values: new Map() },
          {
            truncated: turn.truncated,
            allowParallelReadOnly:
              input.policy.toolSelection.allowParallelReadOnly,
          },
        );
        rememberEffects(results, activatedTools, todos, backgroundTasks);
        for (const result of results) {
          yield {
            type: "tool_result",
            data: {
              id: result.id,
              name: result.name,
              arguments: result.arguments,
              isError: result.isError,
              content: result.content,
              metadata: result.metadata,
            },
          };
          messages.push({
            role: "tool",
            content: result.content,
            toolCallId: result.id,
          });
        }
      }
      for (const [offset, pending] of turn.toolCalls
        .slice(pauseIndex)
        .entries()) {
        messages.push({
          role: "tool",
          toolCallId: pending.id,
          content:
            offset === 0
              ? pauseMessage(pending, pause)
              : "Not executed: the run paused. Re-issue this call if it is still correct after resume.",
        });
      }
      yield {
        type: "paused",
        data: { pause } as unknown as JsonValue,
      };
      const outcome: AgentLoopOutcome = {
        kind: "paused",
        text,
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          pendingPause: pause,
          todos: resetOwnedInProgressTodos([...todos.values()]),
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      return outcome;
    }

    if (
      detector.record(
        turn.toolCalls.map((call) => ({
          name: call.name,
          arguments: call.arguments,
        })),
      )
    ) {
      const outcome: AgentLoopOutcome = {
        kind: "failed",
        text,
        error: "doom loop detected: repeated identical tool calls",
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: resetOwnedInProgressTodos([...todos.values()]),
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }

    messages.push({
      role: "assistant",
      content: turn.text,
      toolCalls: turn.toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        ...(call.extraContent === undefined
          ? {}
          : { extraContent: call.extraContent }),
      })),
    });
    yield* announceDispatch(turn.toolCalls);
    const results = await dispatchToolCalls(
      turn.toolCalls,
      tools,
      { workspace, signal, values: new Map() },
      {
        truncated: turn.truncated,
        allowParallelReadOnly: input.policy.toolSelection.allowParallelReadOnly,
      },
    );
    rememberEffects(results, activatedTools, todos, backgroundTasks);
    for (const result of results) {
      yield {
        type: "tool_result",
        data: {
          id: result.id,
          name: result.name,
          arguments: result.arguments,
          isError: result.isError,
          content: result.content,
          metadata: result.metadata,
        },
      };
      messages.push({
        role: "tool",
        content: result.content,
        toolCallId: result.id,
      });
    }
    for (const steering of input.steering?.() ?? []) {
      messages.push({ role: "user", content: steering });
    }
    if (signal.aborted) {
      const outcome: AgentLoopOutcome = {
        kind: "interrupted",
        text,
        snapshot: {
          version: 1,
          iteration: iteration + 1,
          messages: structuredClone(messages),
          activatedTools: [...activatedTools],
          todos: resetOwnedInProgressTodos([...todos.values()]),
          backgroundTasks: [...backgroundTasks.values()],
        },
      };
      yield* terminal(outcome);
      return outcome;
    }
  }

  const outcome: AgentLoopOutcome = {
    kind: "failed",
    text,
    error: "exceeded iteration limit",
    snapshot: {
      version: 1,
      iteration: input.policy.maxIterations,
      messages: structuredClone(messages),
      activatedTools: [...activatedTools],
      todos: resetOwnedInProgressTodos([...todos.values()]),
      backgroundTasks: [...backgroundTasks.values()],
    },
  };
  yield* terminal(outcome);
  return outcome;
}

/**
 * Announces each call before it runs, so a consumer can show it in progress
 * for as long as it actually takes; the results follow once dispatch returns.
 */
function* announceDispatch(
  calls: readonly AssembledToolCall[],
): Generator<AgentLifecycleEvent, void, void> {
  for (const call of calls) {
    yield {
      type: "tool_dispatched",
      data: { id: call.id, name: call.name, arguments: call.arguments },
    };
  }
}

export function createReactLoop(): AgentLoop {
  return {
    run(input: AgentLoopInput, signal: AbortSignal): AgentLoopExecution {
      const queue = new AsyncEventQueue<AgentLifecycleEvent>();
      const outcome = (async (): Promise<AgentLoopOutcome> => {
        const generator = reactLoopEvents(input, signal);
        try {
          let next = await generator.next();
          while (!next.done) {
            queue.push(next.value);
            next = await generator.next();
          }
          return next.value;
        } finally {
          queue.close();
        }
      })();
      return { events: queue, outcome };
    },
  };
}

export async function runReactLoop(
  input: AgentLoopInput,
  signal: AbortSignal,
): Promise<ReactLoopResult> {
  const events: AgentLifecycleEvent[] = [];
  const execution = createReactLoop().run(input, signal);
  for await (const event of execution.events) events.push(event);
  return { events, outcome: await execution.outcome };
}
