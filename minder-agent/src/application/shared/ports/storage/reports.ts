import type { RunId } from "@domain/index.js";
export interface ReportPort {
  save(runId: RunId, markdown: string): Promise<void>;
  get(runId: RunId): Promise<string | undefined>;
}
