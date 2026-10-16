import type { RunId } from "@domain/index.js";

export interface RunManifestRecord {
  readonly runId: RunId;
  readonly manifest: unknown;
  readonly createdAt: string;
  readonly contentHash?: string;
  readonly manifestName?: string;
  readonly sourcePath?: string;
  readonly yaml?: string;
}

export interface RunTraceRecord {
  readonly runId: RunId;
  readonly seq: number;
  readonly event: unknown;
  readonly createdAt: string;
}

export interface RunValidationRecord {
  readonly runId: RunId;
  readonly name: string;
  readonly passed: boolean;
  readonly details: unknown;
  readonly createdAt: string;
}

export interface RunReportRecord {
  readonly runId: RunId;
  readonly markdown: string;
  readonly createdAt: string;
  readonly artifactId?: string;
  readonly byteSize?: number;
  readonly updatedAt?: string;
}

export interface RunEvidencePort {
  saveManifest(owner: string, record: RunManifestRecord): Promise<void>;
  getManifest(
    owner: string,
    runId: RunId,
  ): Promise<RunManifestRecord | undefined>;
  listTrace(
    owner: string,
    runId: RunId,
    cursor?: string,
    limit?: number,
  ): Promise<readonly RunTraceRecord[]>;
  listValidations(
    owner: string,
    runId: RunId,
  ): Promise<readonly RunValidationRecord[]>;
  getReport(owner: string, runId: RunId): Promise<RunReportRecord | undefined>;
}
