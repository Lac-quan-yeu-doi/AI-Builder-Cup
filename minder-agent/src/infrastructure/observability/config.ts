import type { TelemetryPort } from "@application/shared/ports/index.js";
import { FailOpenTelemetry } from "./fail-open.js";
import { createLangfuseTelemetry } from "./langfuse.js";
import { NoopTelemetry } from "./noop.js";

export interface ObservabilityConfig {
  readonly enabled: boolean;
  readonly langfusePublicKey?: string;
  readonly langfuseSecretKey?: string;
}

const LANGFUSE_KEYS = [
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
] as const;

/** Select process-wide telemetry without exposing configured credentials. */
export function createProductionTelemetry(
  environment: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): TelemetryPort {
  const missing = LANGFUSE_KEYS.filter((key) => !environment[key]?.trim());
  const present = LANGFUSE_KEYS.length - missing.length;
  if (present === 0) return new NoopTelemetry();
  if (missing.length > 0)
    throw new Error(`Incomplete Langfuse configuration: ${missing.join(", ")}`);

  return new FailOpenTelemetry(
    createLangfuseTelemetry({
      baseUrl: environment.LANGFUSE_BASE_URL!,
      publicKey: environment.LANGFUSE_PUBLIC_KEY!,
      secretKey: environment.LANGFUSE_SECRET_KEY!,
      ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
    }),
  );
}
