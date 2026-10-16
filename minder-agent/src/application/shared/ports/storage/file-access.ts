import type { RunId } from "@domain/index.js";
export interface FileAccessRecord {
  readonly runId: RunId;
  readonly path: string;
  readonly operation: "read" | "write" | "delete";
  readonly at: string;
}
export interface FileAccessPort {
  record(access: FileAccessRecord): Promise<void>;
  list(runId: RunId): Promise<readonly FileAccessRecord[]>;
}
