export interface TraceRecorder {
  recordTrace(name: string): Promise<void>;
}
