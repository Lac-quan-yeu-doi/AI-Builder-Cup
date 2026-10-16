import {
  EmptyToolRegistry,
  type ChatCompletionGateway,
  type LlmConfig,
  type ToolContext,
  type ToolRegistryPort,
} from "@application/shared/ports/index.js";
import type {
  AgentEvent,
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
  type AgentLoopPolicy,
  type AgentLoopSnapshot,
} from "@application/agent";
import {
  gatewayToModelPort,
  registryToToolPorts,
} from "../adapters/model-port.js";
import { toolDispatchOf } from "./lifecycle.js";

export const AUTONOMOUS_SYSTEM_PROMPT =
  "You are an autonomous background worker agent. You are given a single task and must complete it end to end using the available tools when they help, then finish with a concise final result. No human is watching: never ask for confirmation or clarification - make a reasonable decision and proceed. Do not stop until the task is done or you have determined it cannot be done, and say which.";
const MAX_ITERATIONS = 20;

export interface AutonomousTurnOptions {
  gateway: ChatCompletionGateway;
  config: LlmConfig;
  prompt: string;
  signal: AbortSignal;
  registry?: ToolRegistryPort;
  context?: Omit<ToolContext, "signal">;
  /** Optional agent-manifest prompt; falls back to the built-in prompt. */
  systemPrompt?: string;
  /** Runtime-owned durable state for a resumed loop. */
  loopSnapshot?: JsonValue;
  maxIterations?: number;
  checkpointThreadId?: string;
  loop?: AgentLoop;
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

export async function* streamAutonomousTurn(
  options: AutonomousTurnOptions,
): AsyncGenerator<AgentEvent, RunOutcome, void> {
  if (!options.prompt.trim()) {
    yield doneEvent();
    return {
      status: "failed",
      text: "",
      error: {
        code: "invalid_input",
        message: "Task prompt must not be empty.",
      },
    };
  }
  if (options.signal.aborted) {
    yield doneEvent();
    return interruptedOutcome("");
  }

  const registry = options.registry ?? new EmptyToolRegistry();
  const toolList = registryTools(registry);
  const tools = registryToToolPorts(registry, toolList, {
    workspaceRoot: options.context?.workspaceRoot ?? process.cwd(),
    workingDirectory: options.context?.workingDirectory ?? process.cwd(),
    ...options.context,
  });

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
    id: "autonomous" as RunId,
    status: "running",
    mode: "autonomous",
    trigger: { source: "autonomous" },
    input: options.prompt,
    depth: 0,
    createdAt: new Date().toISOString(),
  };

  let text = "";
  const loop = options.loop ?? createReactLoop();
  const execution = loop.run(
    {
      run,
      ...(options.checkpointThreadId === undefined
        ? {}
        : { checkpointThreadId: options.checkpointThreadId }),
      policy: policy(options.maxIterations),
      systemPrompt: options.systemPrompt ?? AUTONOMOUS_SYSTEM_PROMPT,
      services: { model, tools },
      ...(options.loopSnapshot === undefined
        ? {}
        : { snapshot: options.loopSnapshot as unknown as AgentLoopSnapshot }),
    },
    options.signal,
  );
  // See streamInteractiveTurn: a start event for every announced call, and one
  // synthesised for a result whose call was never announced.
  const announcedCalls = new Set<string>();
  for await (const event of execution.events) {
    if (event.type === "stream_delta") {
      const data = event.data as {
        text?: string;
        reasoning?: string;
        usage?: { input: number; output: number };
      };
      if (data.text !== undefined) {
        text += data.text;
        yield { type: "text", data: data.text };
      }
      if (data.reasoning !== undefined)
        yield { type: "reasoning", data: data.reasoning };
      if (data.usage !== undefined)
        yield { type: "token_usage", data: data.usage };
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
    } else if (
      event.type === "completed" ||
      event.type === "failed" ||
      event.type === "paused"
    ) {
      const outcome = terminalOutcome(
        event.data,
        text,
        capturedError,
        options.signal,
      );
      yield doneEvent(outcome.text);
      return outcome;
    }
  }
  const outcome = await execution.outcome;
  const terminal = terminalOutcome(
    { outcome },
    text,
    capturedError,
    options.signal,
  );
  yield doneEvent(terminal.text);
  return terminal;
}

function terminalOutcome(
  data: unknown,
  text: string,
  capturedError: unknown,
  signal: AbortSignal,
): RunOutcome {
  const outcome = (data as { outcome?: TerminalLoopOutcome } | undefined)
    ?.outcome;
  if (outcome?.kind === "completed")
    return {
      status: "completed",
      text: outcome.text ?? text,
      ...loopSnapshot(outcome),
    };
  if (outcome?.kind === "backgrounded")
    return {
      status: "backgrounded",
      text: outcome.text ?? text,
      ...loopSnapshot(outcome),
    };
  if (outcome?.kind === "interrupted" || signal.aborted)
    return {
      ...interruptedOutcome(outcome?.text ?? text),
      ...loopSnapshot(outcome),
    };
  if (capturedError !== undefined && !isAbortError(capturedError)) {
    return {
      status: "failed",
      text: outcome?.text ?? text,
      error: {
        code: errorCode(capturedError),
        message: errorMessage(capturedError),
      },
      ...loopSnapshot(outcome),
    };
  }
  return {
    status: "failed",
    text: outcome?.text ?? text,
    error: {
      code: "transport",
      message: outcome?.error ?? "Autonomous run exceeded its iteration limit.",
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
      : "Autonomous run failed.";
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
