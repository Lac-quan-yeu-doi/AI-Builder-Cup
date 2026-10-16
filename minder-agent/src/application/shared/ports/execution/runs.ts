import type { Run, RunId, RunStatus, SessionId } from "@domain/index.js";
export interface FinishRun {
  readonly id: RunId;
  readonly status: Exclude<
    RunStatus,
    "queued" | "running" | "awaiting_children"
  >;
  readonly error?: string;
}
export interface RunPort {
  create(run: Run): Promise<void>;
  markRunning(id: RunId): Promise<void>;
  finish(input: FinishRun): Promise<Run>;
  activeForSession(sessionId: SessionId): Promise<Run | undefined>;
  get(id: RunId): Promise<Run | undefined>;
  claimDelivery(source: string, deliveryId: string): Promise<boolean>;
}
