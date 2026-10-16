import type { JsonObject, JsonValue } from "@domain/shared";
import { redactSecrets } from "@domain/runtime/secret-redaction.js";
import type { DebugLog } from "./debug-log.js";

export type RuntimeLogLevel = "info" | "warn" | "error";

/** One JSON line per boundary; logging must never change runtime outcomes. */
export function writeRuntimeLog(
  log: DebugLog | undefined,
  event: string,
  fields: JsonObject,
  level: RuntimeLogLevel = "info",
  secrets: readonly string[] = [],
): void {
  if (log === undefined) return;
  try {
    // Replace known credentials before truncation, including nonstandard keys.
    const encoded = JSON.stringify(fields);
    const scrubbed = secrets.reduce(
      (value, secret) =>
        secret.length === 0 ? value : value.replaceAll(secret, "[REDACTED]"),
      encoded,
    );
    const safe = redactSecrets(JSON.parse(scrubbed) as JsonObject);
    log(
      JSON.stringify({
        ...boundFields(safe),
        event,
        level,
        service: "celesnity-agent",
        occurredAt: new Date().toISOString(),
      }),
    );
  } catch {
    // A broken sink or malformed diagnostic field cannot fail a run.
  }
}

function boundFields(fields: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(fields)
      .slice(0, 32)
      .map(([key, value]) => [
        key,
        typeof value === "string"
          ? value.slice(0, 512)
          : Array.isArray(value)
            ? (value as JsonValue[])
                .slice(0, 32)
                .map((item) =>
                  typeof item === "string" ? item.slice(0, 128) : item,
                )
            : value,
      ]),
  );
}

export function runtimeErrorFields(error: unknown): JsonObject {
  if (!(error instanceof Error)) return { errorCode: "unknown_error" };
  const code = "code" in error ? error.code : undefined;
  const match = /HTTP (\d{3})/u.exec(error.message);
  const lower = error.message.toLowerCase();
  const errorCategory = /thought.signature/u.test(lower)
    ? "thought_signature"
    : /schema|function.declaration|tool.definition/u.test(lower)
      ? "tool_schema"
      : /context.length|token.limit|too.many.tokens/u.test(lower)
        ? "token_limit"
        : /rate.limit|quota|resource.exhausted/u.test(lower)
          ? "rate_limit"
          : /authentication|api.key|permission.denied/u.test(lower)
            ? "provider_auth"
            : "unspecified";
  return {
    errorName: error.name,
    errorCode: typeof code === "string" ? code : "runtime_error",
    errorCategory,
    ...(match === null ? {} : { providerStatus: Number(match[1]) }),
  };
}
