import type { JsonValue } from "@domain/index.js";
import type { RunManifest, SecretRedactor } from "./contracts.js";
import type { Sha256 } from "@application/shared/ports/index.js";

export type { RunManifest } from "./contracts.js";

export interface RunManifestOutcome {
  readonly runId: string;
  readonly status: string;
}

/**
 * Build an immutable, redacted run manifest from the run's events and outcome.
 * Every string is passed through the redactor so configured secrets and
 * credential-shaped values never appear in the manifest or its content hash.
 */
export function createRunManifest(
  events: readonly JsonValue[],
  outcome: RunManifestOutcome,
  redactor: SecretRedactor,
  sha256: Sha256,
): RunManifest {
  const values: JsonValue = {
    runId: redactor.redact(outcome.runId),
    status: redactor.redact(outcome.status),
    events: events.map((event) => redactValue(event, redactor)),
  };
  const contentHash = sha256(JSON.stringify(values));
  return Object.freeze({ contentHash, values });
}

function redactValue(value: JsonValue, redactor: SecretRedactor): JsonValue {
  if (typeof value === "string") return redactor.redact(value);
  if (Array.isArray(value)) {
    const arrayValue = value as readonly JsonValue[];
    return arrayValue.map((entry) => redactValue(entry, redactor));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    const objectValue = value as Record<string, JsonValue>;
    for (const [key, entry] of Object.entries(objectValue))
      result[key] = redactValue(entry, redactor);
    return result;
  }
  return value;
}
