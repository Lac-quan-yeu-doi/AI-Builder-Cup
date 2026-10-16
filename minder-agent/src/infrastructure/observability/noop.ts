import type {
  RunTelemetryInput,
  RunTelemetryOutcome,
  TelemetryEvent,
  TelemetryPort,
  TraceContext,
} from "@application/shared/ports/index.js";
export class NoopTelemetry implements TelemetryPort {
  async startRun(_input: RunTelemetryInput): Promise<TraceContext> {
    await Promise.resolve();
    return { traceId: "noop", spanId: "noop" };
  }
  async record(_event: TelemetryEvent): Promise<void> {
    await Promise.resolve();
  }
  async finishRun(_input: RunTelemetryOutcome): Promise<void> {
    await Promise.resolve();
  }
}
