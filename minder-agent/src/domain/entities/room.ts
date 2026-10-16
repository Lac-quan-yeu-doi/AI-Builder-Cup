import type { CallerId, RoomId, WorkspacePath } from "../values/ids.js";

export type RoomStatus = "open" | "closed";
export type RunKind = "session_bound" | "ephemeral";
export const DEFAULT_MAX_QUEUED = 256;
export interface Room {
  readonly id: RoomId;
  readonly key?: string;
  readonly name: string;
  readonly maxConcurrentRuns: number;
  readonly maxQueued: number;
  readonly status: RoomStatus;
  readonly closedAt?: string;
  readonly workspacePath?: WorkspacePath;
  readonly owner: CallerId;
}
