import type { LoopSnapshot } from "./react-loop-state.js";

export type AgentLoopSnapshot = LoopSnapshot;

export interface AgentLoopOutcome {
  readonly kind:
    "completed" | "paused" | "failed" | "interrupted" | "backgrounded";
  readonly text?: string;
  /** Explicit status supplied by TaskStop/task_complete when present. */
  readonly completionStatus?: string;
  readonly error?: string;
  readonly snapshot?: AgentLoopSnapshot;
}
