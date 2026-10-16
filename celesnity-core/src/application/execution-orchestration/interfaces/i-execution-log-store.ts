import type { LogLocation } from '@domain/execution-orchestration/value-objects/execution-value-objects';

export interface ExecutionLogContent {
  readonly bucket: string;
  readonly objectKey: string;
  readonly text: string;
  readonly byteSize: number;
}

/**
 * Buffered, append-style writer for a single execution log object. Chunks are secret
 * redacted as they are appended. `flush` persists everything written so far so the log
 * is readable while the job is still running; `finalize` performs a last flush.
 */
export interface ExecutionLogWriter {
  append(chunk: string): void;
  flush(): Promise<void>;
  finalize(): Promise<number>;
}

export interface IExecutionLogStore {
  openWriter(location: LogLocation): ExecutionLogWriter;
  read(location: LogLocation): Promise<ExecutionLogContent | undefined>;
}
