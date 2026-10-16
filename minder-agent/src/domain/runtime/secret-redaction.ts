export type SecretKind =
  | "anthropic_api_key"
  | "openai_api_key"
  | "groq_api_key"
  | "google_api_key"
  | "github_token"
  | "bearer_token"
  | "password_assignment"
  | "base64_blob";

export interface SecretMatch {
  readonly kind: SecretKind;
  readonly start: number;
  readonly end: number;
}

const patterns: readonly [SecretKind, RegExp][] = [
  ["anthropic_api_key", /sk-ant-[A-Za-z0-9_-]{20,}/gu],
  ["openai_api_key", /sk-(?:proj-|live-|[b-zB-Z0-9_])[A-Za-z0-9_-]{19,}/gu],
  ["groq_api_key", /gsk_[A-Za-z0-9_-]{20,}/gu],
  ["google_api_key", /AIza[A-Za-z0-9_-]{30,}/gu],
  ["github_token", /ghp_[A-Za-z0-9]{30,}/gu],
  ["bearer_token", /Bearer\s+[A-Za-z0-9_.-]{20,}/gu],
  ["password_assignment", /(?:password|passwd|pass)\s*=\s*\S+/giu],
  ["base64_blob", /\b[A-Za-z0-9+/]{40,}={0,2}\b/gu],
];

export function detectSecrets(value: string): readonly SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const text = match[0];
      const start = match.index ?? 0;
      matches.push({ kind, start, end: start + text.length });
    }
  }
  return matches.sort((left, right) => left.start - right.start);
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (
      key !== undefined &&
      /(?:password|passwd|secret|token|api[_-]?key|credential)/iu.test(key)
    )
      return "[REDACTED]";
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey),
    ]),
  );
}

function redactString(value: string): string {
  const matches = detectSecrets(value);
  if (matches.length === 0) return value;
  const ranges: Array<[number, number]> = [];
  for (const match of matches) {
    const previous = ranges[ranges.length - 1];
    if (previous && match.start <= previous[1])
      previous[1] = Math.max(previous[1], match.end);
    else ranges.push([match.start, match.end]);
  }
  let result = value;
  for (const [start, end] of ranges.reverse())
    result = `${result.slice(0, start)}[REDACTED]${result.slice(end)}`;
  return result;
}
