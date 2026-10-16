import type {
  RunTelemetryInput,
  RunTelemetryOutcome,
  TelemetryEvent,
  TelemetryPort,
  TraceContext,
} from "@application/shared/ports/index.js";

/** Makes observability non-blocking even when its provider is unavailable. */
export class FailOpenTelemetry implements TelemetryPort {
  constructor(private readonly delegate: TelemetryPort) {}

  async startRun(input: RunTelemetryInput): Promise<TraceContext> {
    try {
      return await this.delegate.startRun(input);
    } catch {
      return { traceId: "noop", spanId: "noop" };
    }
  }

  async record(event: TelemetryEvent): Promise<void> {
    try {
      await this.delegate.record(event);
    } catch {
      return;
    }
  }

  async finishRun(input: RunTelemetryOutcome): Promise<void> {
    try {
      await this.delegate.finishRun(input);
    } catch {
      return;
    }
  }
}

/**
 * Run a fire-and-forget observability action without letting its failure
 * propagate. Telemetry is strictly fail-open: it can never delay, fail, or
 * reorder a run. Errors are swallowed intentionally.
 */
export async function failOpen(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    // Observability failures are non-fatal by design.
  }
}
