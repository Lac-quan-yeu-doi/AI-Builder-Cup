import type { JsonValue } from "@domain/index.js";

export interface ToolCallFingerprint {
  readonly name: string;
  readonly arguments: JsonValue;
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, JsonValue>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key] ?? null)}`).join(",")}}`;
}

/**
 * Detects a stalled ReAct loop: the model reissuing the same tool call(s)
 * turn after turn. Fingerprints each turn's tool calls as
 * `name:stableStringify(arguments)` and trips once the identical fingerprint
 * has repeated `maxRepeated` consecutive times.
 */
export class DoomLoopDetector {
  private lastKey: string | undefined;
  private streak = 0;

  constructor(private readonly maxRepeated: number) {}

  record(calls: readonly ToolCallFingerprint[]): boolean {
    if (calls.length === 0) {
      this.reset();
      return false;
    }
    const key = calls
      .map((call) => `${call.name}:${stableStringify(call.arguments)}`)
      .join("|");
    if (key === this.lastKey) {
      this.streak += 1;
    } else {
      this.lastKey = key;
      this.streak = 1;
    }
    return this.maxRepeated > 0 && this.streak >= this.maxRepeated;
  }

  reset(): void {
    this.lastKey = undefined;
    this.streak = 0;
  }
}
