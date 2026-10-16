import { randomUUID } from "node:crypto";
import type {
  RunTelemetryInput,
  RunTelemetryOutcome,
  TelemetryEvent,
  TelemetryPort,
  TraceContext,
} from "@application/shared/ports/index.js";

export interface LangfuseAdapter {
  readonly provider: "langfuse";
}

export interface LangfuseConfig {
  readonly baseUrl: string;
  readonly publicKey: string;
  readonly secretKey: string;
  readonly fetch?: typeof fetch;
}

/**
 * Concrete Langfuse {@link TelemetryPort}. Trace identifiers are generated
 * locally at run admission so the port never blocks on a network call to start
 * a run; batched events are shipped best-effort. Configured keys are never
 * logged. Compose with {@link FailOpenTelemetry} so a provider failure cannot
 * delay, fail, or reorder a run.
 */
export function createLangfuseTelemetry(config: LangfuseConfig): TelemetryPort {
  const fetchImpl = config.fetch ?? fetch;
  const authorization = `Basic ${Buffer.from(
    `${config.publicKey}:${config.secretKey}`,
  ).toString("base64")}`;
  const ship = async (path: string, body: unknown): Promise<void> => {
    await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    });
  };
  return {
    async startRun(input: RunTelemetryInput): Promise<TraceContext> {
      // Identifiers are created at admission; no network call is required here.
      await Promise.resolve();
      return { traceId: randomUUID(), spanId: input.runId };
    },
    async record(event: TelemetryEvent): Promise<void> {
      await ship("/api/public/ingestion", { type: "event", event });
    },
    async finishRun(input: RunTelemetryOutcome): Promise<void> {
      await ship("/api/public/ingestion", { type: "trace-finish", input });
    },
  };
}
