import type { JsonValue, RunId } from "@domain/index.js";
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
}
export interface TelemetryEvent {
  readonly name: string;
  readonly runId?: RunId;
  readonly data: JsonValue;
}
export interface RunTelemetryInput {
  readonly runId: RunId;
  readonly name: string;
}
export interface RunTelemetryOutcome {
  readonly runId: RunId;
  readonly success: boolean;
}
export interface TelemetryPort {
  startRun(input: RunTelemetryInput): Promise<TraceContext>;
  record(event: TelemetryEvent): Promise<void>;
  finishRun(input: RunTelemetryOutcome): Promise<void>;
}
