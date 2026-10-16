import type {
  ChatCompletionGateway,
  ChatMessage,
  LlmConfig,
  ToolContext,
  ToolRegistryPort,
} from "@application/shared/ports/index.js";
import type {
  AgentEvent,
  AskUserRequest,
  JsonObject,
  JsonValue,
  RunErrorCode,
  RunOutcome,
} from "@domain/shared";
import type { Run, RunId } from "@domain/index.js";
import {
  createReactLoop,
  type AgentLoop,
  type AgentLoopOutcome,
  type AgentLoopSnapshot,
  type AgentLoopPolicy,
  type ClientToolDefinition,
  type PauseRequest,
  type ToolApprovalGate,
} from "@application/agent";
import type { ModelMessage } from "@application/shared/ports/index.js";
import type { InteractiveSession, SessionStore } from "@application/session";
import { toolDispatchOf } from "./lifecycle.js";
import type { NativeAgentController } from "./native-agent.js";
import {
  gatewayToModelPort,
  registryToToolPorts,
} from "../adapters/model-port.js";

export const INTERACTIVE_SYSTEM_PROMPT =
  "You are an interactive assistant with a human attached. Complete the user's request using the available tools when they help. AskUser is available only when a material ambiguity or destructive confirmation genuinely requires the human; do not ask for progress updates or obvious choices. Use the tool schemas exactly and finish with a concise answer.";
const MAX_ITERATIONS = 20;

export interface InteractiveTurnOptions {
  gateway: ChatCompletionGateway;
  config: LlmConfig;
  session: InteractiveSession;
  sessionStore: SessionStore;
  registry: ToolRegistryPort;
  context: ToolContext;
  prompt?: string;
  signal: AbortSignal;
  controller?: NativeAgentController;
  clientTools?: readonly ClientToolDefinition[];
  approvalGate?: ToolApprovalGate;
  /** Optional agent-manifest prompt; falls back to the built-in prompt. */
  systemPrompt?: string;
  /** Runtime-owned durable state for a resumed loop. */
  loopSnapshot?: JsonValue;
  resumeToolResult?: {
    readonly id: string;
    readonly content: string;
    readonly isError: boolean;
  };
  /** Replaces an approval placeholder in a durable snapshot without a user turn. */
  continuation?: InteractiveTurnContinuation;
  maxIterations?: number;
  planReview?: boolean;
  checkpointThreadId?: string;
  loop?: AgentLoop;
}

export interface InteractiveTurnContinuation {
  readonly snapshot: JsonValue;
  readonly toolResult: {
    readonly toolCallId: string;
    readonly content: string;
    readonly isError: boolean;
  };
}

function policy(maxIterations = MAX_ITERATIONS): AgentLoopPolicy {
  return {
    maxIterations,
    doomLoop: { maxRepeatedToolCalls: 0 },
    toolSelection: { allowParallelReadOnly: false },
    reminders: { enabled: false },
    compaction: { enabled: false, tokenThreshold: 1_000_000 },
  };
}

export async function* streamInteractiveTurn(
  options: InteractiveTurnOptions,
): AsyncGenerator<AgentEvent, RunOutcome, void> {
  const continuation = continuationInput(options);
  const prompt = options.prompt?.trim() ?? "";
  if (continuation === undefined && !prompt) {
    yield doneEvent();
    return {
      status: "failed",
      text: "",
      error: { code: "transport", message: "User input must not be empty." },
    };
  }
  if (options.signal.aborted) {
    yield doneEvent();
    return interruptedOutcome("");
  }

  const priorHistory = options.session.history.map((message) =>
    structuredClone(message),
  );
  const answer = continuation === undefined ? prompt : "";
  if (continuation === undefined && options.session.pendingQuestion) {
    const question = options.session.pendingQuestion;
    const selected = question.options.some((option) => option.label === answer);
    if (question.options.length > 0 && !question.allow_other && !selected) {
      yield doneEvent();
      return {
        status: "failed",
        text: "",
        error: {
          code: "invalid_input",
          message: "Answer must be one of the offered options.",
        },
      };
    }
  }
  const userMessage: ChatMessage = { role: "user", content: answer };

  const toolList = registryTools(options.registry);
  const { signal: _toolSignal, ...toolContext } = options.context;
  void _toolSignal;
  const tools = registryToToolPorts(options.registry, toolList, toolContext);

  let capturedError: unknown;
  const baseModel = gatewayToModelPort(
    options.gateway,
    options.config.model,
    options.config.temperature,
    options.config.maxTokens,
    options.config.provider,
  );
  const model = {
    async *stream(
      request: Parameters<typeof baseModel.stream>[0],
      signal: AbortSignal,
    ) {
      try {
        yield* baseModel.stream(request, signal);
      } catch (error) {
        capturedError = error;
        throw error;
      }
    },
  };

  const run: Run = {
    id: "interactive" as RunId,
    status: "running",
    mode: "interactive",
    trigger: { source: "interactive" },
    input: answer,
    depth: 0,
    createdAt: new Date().toISOString(),
  };

  const history: ChatMessage[] = [
    ...priorHistory,
    ...(continuation !== undefined || options.resumeToolResult === undefined
      ? []
      : [
          {
            role: "tool" as const,
            tool_call_id: options.resumeToolResult.id,
            content: options.resumeToolResult.content,
          },
        ]),
    ...(continuation === undefined ? [userMessage] : []),
  ];
  let text = "";
  let assistantText = "";
  const loop = options.loop ?? createReactLoop();
  const execution = loop.run(
    {
      run,
      ...(options.checkpointThreadId === undefined
        ? {}
        : { checkpointThreadId: options.checkpointThreadId }),
      policy: policy(options.maxIterations),
      systemPrompt: options.systemPrompt ?? INTERACTIVE_SYSTEM_PROMPT,
      includePlanReview: options.planReview ?? true,
      services: {
        model,
        tools,
        ...(options.clientTools === undefined
          ? {}
          : { clientTools: options.clientTools }),
        ...(options.approvalGate === undefined
          ? {}
          : { approvalGate: options.approvalGate }),
      },
      history: toModelHistory(history),
      ...(continuation !== undefined
        ? {
            continuation: {
              snapshot: continuation.snapshot as unknown as AgentLoopSnapshot,
              toolResult: continuation.toolResult,
            },
          }
        : options.loopSnapshot === undefined
          ? {}
          : { snapshot: options.loopSnapshot as unknown as AgentLoopSnapshot }),
      steering: () => options.controller?.takeSteering() ?? [],
      followUp: () => options.controller?.takeFollowUps() ?? [],
    },
    options.signal,
  );

  // Calls the loop announced before running them. A result whose call was
  // never announced — a loop without dispatch events, or a continuation —
  // still gets its start event, so a consumer always sees the pair.
  const announcedCalls = new Set<string>();
  for await (const event of execution.events) {
    if (event.type === "stream_delta") {
      const data = event.data as {
        text?: string;
        turnBreak?: boolean;
        reasoning?: string;
        usage?: { input: number; output: number };
      };
      if (data.text !== undefined) {
        text += data.text;
        // The break between turns belongs to the run's text, not to the
        // message the model wrote.
        if (data.turnBreak !== true) assistantText += data.text;
        yield { type: "text", data: data.text };
      }
      if (data.reasoning !== undefined)
        yield { type: "reasoning", data: data.reasoning };
      if (data.usage !== undefined)
        yield { type: "token_usage", data: data.usage };
    } else if (event.type === "model_finished") {
      if (assistantText)
        history.push({ role: "assistant", content: assistantText });
      assistantText = "";
    } else if (event.type === "tool_dispatched") {
      const call = toolDispatchOf(event);
      if (call) {
        announcedCalls.add(call.id);
        yield { type: "tool_started", data: call };
      }
    } else if (event.type === "tool_result") {
      const data = event.data as {
        id: string;
        name: string;
        arguments: JsonObject;
        isError: boolean;
        content: string;
      };
      if (!announcedCalls.delete(data.id))
        yield {
          type: "tool_started",
          data: { id: data.id, name: data.name, arguments: data.arguments },
        };
      yield {
        type: "tool_finished",
        data: { id: data.id, name: data.name, success: !data.isError },
      };
      yield {
        type: "tool_result",
        data: {
          id: data.id,
          name: data.name,
          is_error: data.isError,
          content: data.content,
        },
      };
      history.push({
        role: "tool",
        tool_call_id: data.id,
        content: data.content,
      });
    } else if (event.type === "paused") {
      const pause = (event.data as { pause?: PauseRequest }).pause;
      if (pause?.kind === "question") {
        const request: AskUserRequest = {
          version: 1,
          kind: pause.request.kind,
          question: pause.request.question,
          options: pause.request.options.map((option) => ({
            label: option.label,
          })),
          allow_other: pause.request.allowOther,
        };
        const outcome = await execution.outcome;
        options.sessionStore.appendTurn(
          options.session.id,
          persistedHistory(outcome) ?? history,
          request,
        );
        yield { type: "awaiting_input", data: request };
        yield doneEvent(text);
        return {
          status: "completed",
          text,
          ...(outcome.snapshot === undefined
            ? {}
            : { loopSnapshot: outcome.snapshot as unknown as JsonValue }),
        };
      }
      if (pause?.kind === "plan") {
        const outcome = await execution.outcome;
        options.sessionStore.appendTurn(
          options.session.id,
          persistedHistory(outcome) ?? history,
          null,
        );
        yield { type: "awaiting_plan", data: pause.request };
        yield doneEvent(text);
        return {
          status: "completed",
          text,
          ...(outcome.snapshot === undefined
            ? {}
            : { loopSnapshot: outcome.snapshot as unknown as JsonValue }),
        };
      }
      if (pause?.kind === "client_tool") {
        const outcome = await execution.outcome;
        options.sessionStore.appendTurn(
          options.session.id,
          persistedHistory(outcome) ?? history,
          null,
        );
        yield { type: "awaiting_client_tool", data: pause.request };
        yield doneEvent(text);
        return {
          status: "completed",
          text,
          ...(outcome.snapshot === undefined
            ? {}
            : { loopSnapshot: outcome.snapshot as unknown as JsonValue }),
        };
      }
      if (pause?.kind === "approval") {
        const outcome = await execution.outcome;
        options.sessionStore.appendTurn(
          options.session.id,
          persistedHistory(outcome) ?? history,
          null,
        );
        yield {
          type: "awaiting_approval",
          data: {
            approval_id: pause.request.approvalId,
            action: pause.request.action,
            preview: pause.request.preview,
            expires_at: pause.request.expiresAt,
          },
        };
        yield doneEvent(text);
        return {
          status: "completed",
          text,
          ...(outcome.snapshot === undefined
            ? {}
            : { loopSnapshot: outcome.snapshot as unknown as JsonValue }),
        };
      }
    } else if (event.type === "completed" || event.type === "failed") {
      const outcome = (
        event.data as {
          outcome?: { kind?: string; text?: string; error?: string };
        }
      ).outcome;
      if (outcome?.kind === "completed") {
        const loopOutcome = await execution.outcome;
        options.sessionStore.appendTurn(
          options.session.id,
          persistedHistory(loopOutcome) ?? history,
          null,
        );
        yield doneEvent(text);
        return {
          status: "completed",
          text,
          ...loopSnapshot(loopOutcome),
        };
      }
      const failure = terminalFailure(
        outcome as TerminalLoopOutcome | undefined,
        text,
        capturedError,
        options.signal,
      );
      yield doneEvent(failure.text);
      return failure;
    }
  }
  const outcome = await execution.outcome;
  const failure = terminalFailure(outcome, text, capturedError, options.signal);
  yield doneEvent(failure.text);
  return failure;
}

function toModelHistory(
  history: readonly ChatMessage[],
): readonly ModelMessage[] {
  return history.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        toolCallId: message.tool_call_id,
      };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        ...(message.tool_calls === undefined
          ? {}
          : {
              toolCalls: message.tool_calls.map((call) => ({
                id: call.id,
                name: call.function.name,
                arguments: {},
                rawArguments: call.function.arguments,
                ...(call.extra_content === undefined
                  ? {}
                  : { extraContent: call.extra_content }),
              })),
            }),
      };
    }
    return { role: message.role, content: message.content };
  });
}

/**
 * The loop transcript is canonical: it retains assistant tool-call IDs and
 * matching tool results. The system message is deliberately omitted because
 * each new turn supplies the current system prompt separately.
 */
function persistedHistory(
  outcome: AgentLoopOutcome,
): ChatMessage[] | undefined {
  const messages = outcome.snapshot?.messages;
  if (messages === undefined) return undefined;
  return messages.flatMap((message): ChatMessage[] => {
    if (message.role === "system") return [];
    if (message.role === "tool") {
      if (message.toolCallId === undefined)
        throw new Error(
          "Loop snapshot tool result is missing its tool-call ID.",
        );
      return [
        {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content,
        },
      ];
    }
    if (message.role === "assistant") {
      return [
        {
          role: "assistant",
          content: message.content,
          ...(message.toolCalls === undefined
            ? {}
            : {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function" as const,
                  function: {
                    name: call.name,
                    arguments: "{}",
                  },
                  ...(call.extraContent === undefined
                    ? {}
                    : { extra_content: call.extraContent }),
                })),
              }),
        },
      ];
    }
    return [{ role: "user", content: message.content }];
  });
}

function continuationInput(
  options: InteractiveTurnOptions,
): InteractiveTurnContinuation | undefined {
  return options.continuation;
}

function terminalFailure(
  outcome: TerminalLoopOutcome | undefined,
  text: string,
  capturedError: unknown,
  signal: AbortSignal,
): RunOutcome {
  if (signal.aborted || outcome?.kind === "interrupted")
    return { ...interruptedOutcome(text), ...loopSnapshot(outcome) };
  if (outcome?.kind === "backgrounded")
    return {
      status: "backgrounded",
      text: outcome.text ?? text,
      ...loopSnapshot(outcome),
    };
  if (capturedError !== undefined && !isAbortError(capturedError)) {
    return {
      status: "failed",
      text,
      error: {
        code: errorCode(capturedError),
        message: errorMessage(capturedError),
      },
      ...loopSnapshot(outcome),
    };
  }
  return {
    status: "failed",
    text,
    error: {
      code: "transport",
      message: outcome?.error ?? "Interactive run failed.",
    },
    ...loopSnapshot(outcome),
  };
}

type TerminalLoopOutcome = Pick<
  AgentLoopOutcome,
  "kind" | "text" | "error" | "snapshot"
>;

function loopSnapshot(
  outcome: TerminalLoopOutcome | undefined,
): Pick<RunOutcome, "loopSnapshot"> {
  return outcome?.snapshot === undefined
    ? {}
    : { loopSnapshot: outcome.snapshot as unknown as JsonValue };
}

function registryTools(registry: ToolRegistryPort) {
  return registry.all();
}

function doneEvent(responseText = ""): AgentEvent {
  return { type: "done", data: { response_text: responseText } };
}

function interruptedOutcome(text: string): RunOutcome {
  return {
    status: "interrupted",
    text,
    error: { code: "interrupted", message: "Run interrupted." },
  };
}

function errorCode(error: unknown): RunErrorCode {
  if (!isRecord(error) || typeof error.code !== "string") return "transport";
  return isRunErrorCode(error.code) ? error.code : "transport";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : isRecord(error) && typeof error.message === "string"
      ? error.message
      : "Interactive run failed.";
}

function isRunErrorCode(value: string): value is RunErrorCode {
  return [
    "invalid_input",
    "configuration",
    "transport",
    "provider",
    "stream",
    "interrupted",
  ].includes(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
