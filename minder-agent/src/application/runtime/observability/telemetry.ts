import type { JsonValue } from "@domain/index.js";
import type {
  RunTelemetryInput,
  RunTelemetryOutcome,
  TelemetryEvent,
  TelemetryPort,
} from "@application/shared/ports/index.js";

/** Schedule observability work without putting it on the run success path. */
export function emitTelemetry(
  telemetry: TelemetryPort | undefined,
  action: () => Promise<unknown>,
): void {
  if (telemetry === undefined) return;
  void Promise.resolve()
    .then(action)
    .catch(() => undefined);
}

export function telemetryStart(
  telemetry: TelemetryPort | undefined,
  input: RunTelemetryInput,
): void {
  emitTelemetry(telemetry, () => telemetry!.startRun(input));
}

export function telemetryEvent(
  telemetry: TelemetryPort | undefined,
  event: TelemetryEvent,
): void {
  emitTelemetry(telemetry, () => telemetry!.record(event));
}

export function telemetryFinish(
  telemetry: TelemetryPort | undefined,
  input: RunTelemetryOutcome,
): void {
  emitTelemetry(telemetry, () => telemetry!.finishRun(input));
}

export function eventTelemetryData(event: {
  readonly runId: string;
  readonly seq: number;
  readonly payload: unknown;
}): JsonValue {
  return event as unknown as JsonValue;
}
