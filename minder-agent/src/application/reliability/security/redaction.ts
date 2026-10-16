import type { SecretRedactor } from "../evidence/contracts.js";

export function createSecretRedactor(
  secrets: readonly string[] = [],
): SecretRedactor {
  const values = secrets
    .filter((secret) => secret.length > 0)
    .sort((left, right) => right.length - left.length);
  return {
    redact(input: string): string {
      let result = input;
      for (const secret of values)
        result = result.replace(
          new RegExp(escapeRegExp(secret), "g"),
          "[REDACTED]",
        );
      return result
        .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
        .replace(
          /(\b(?:api[_-]?key|token|secret|password)\s*=\s*)[^\s,;]+/gi,
          "$1[REDACTED]",
        );
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
