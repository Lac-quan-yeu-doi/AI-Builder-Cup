function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolvePath(path: string, payload: Record<string, unknown>): string | undefined {
  const segments = path
    .replace(/^\$\.?/, '')
    .split('.')
    .filter((segment) => segment.length > 0);
  let current: unknown = payload;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  if (typeof current === 'string') return current;
  if (typeof current === 'number' || typeof current === 'boolean') return String(current);
  return undefined;
}

// No trailing "." in the character class: `$.amount.` at the end of a
// sentence must resolve as path `amount` followed by a literal period, not
// swallow the sentence's own punctuation into the path.
const EMBEDDED_PATH_PATTERN = /\$\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*/g;

export function applyInputTemplate(
  template: Readonly<Record<string, string>>,
  payload: unknown,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(template)) {
    if (!value.includes('$.')) {
      result[key] = value;
      continue;
    }
    if (!isRecord(payload)) {
      return undefined;
    }
    let failed = false;
    const resolvedValue = value.replace(EMBEDDED_PATH_PATTERN, (match) => {
      const resolved = resolvePath(match, payload);
      if (resolved === undefined) {
        failed = true;
        return match;
      }
      return resolved;
    });
    if (failed) {
      return undefined;
    }
    result[key] = resolvedValue;
  }
  return result;
}
