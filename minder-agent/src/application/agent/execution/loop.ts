import type { JsonObject, Run, Session } from "@domain/index.js";
import type {
  ModelMessage,
  ModelPort,
  ToolPort,
} from "@application/shared/ports/index.js";
import type { AgentLifecycleEvent } from "./lifecycle.js";
import type { AgentLoopOutcome } from "./completion.js";
import type { AgentLoopPolicy } from "../policy/loop-policy.js";
import type { LoopContinuation, LoopSnapshot } from "./react-loop-state.js";
import type { ToolApprovalGate } from "../policy/approval-gate.js";

export interface AgentLoopInput {
  readonly run: Run;
  /** Server-owned LangGraph thread identity; stable across successor runs. */
  readonly checkpointThreadId?: string;
  readonly session?: Session;
  readonly policy: AgentLoopPolicy;
  readonly services: AgentLoopServices;
  /** Prior transcript for continuation or durable resume; excludes system prompt. */
  readonly history?: readonly ModelMessage[];
  /** Durable loop-owned state restored when a runtime continues this run. */
  readonly snapshot?: LoopSnapshot;
  /** A verified tool result that continues an existing paused snapshot. */
  readonly continuation?: LoopContinuation;
  /** Overrides the loop's default mode-based system prompt when provided. */
  readonly systemPrompt?: string;
  /** Whether interactive runs expose the human plan-review tool. */
  readonly includePlanReview?: boolean;
  /** Drained after each tool round; results are injected as user messages. */
  readonly steering?: () => readonly string[];
  /** Drained when the model would otherwise stop; non-empty continues the turn. */
  readonly followUp?: () => readonly string[];
}
export interface AgentLoopServices {
  readonly model: ModelPort;
  readonly tools: readonly ToolPort[];
  readonly approvalGate?: ToolApprovalGate;
  /** Tools executed by the connected client after the loop pauses. */
  readonly clientTools?: readonly ClientToolDefinition[];
}

export interface ClientToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonObject;
}

export interface AgentLoopExecution {
  readonly events: AsyncIterable<AgentLifecycleEvent>;
  readonly outcome: Promise<AgentLoopOutcome>;
}

export interface AgentLoop {
  run(input: AgentLoopInput, signal: AbortSignal): AgentLoopExecution;
}
