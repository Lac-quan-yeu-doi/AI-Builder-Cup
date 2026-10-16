/**
 * Advisory correction lint: flags a WHERE-clause string literal that doesn't
 * match any value already seen for that column, and suggests the closest one.
 *
 * A pure, text/regex-based sibling to `sql-correctness.linter.ts` (same
 * philosophy: heuristic, never blocking, no real SQL parser), but with a
 * dependency that file's rules deliberately avoid — a table's column
 * profiles (Requirement: 01, "grounding via summarized stats"). Ported from
 * Foundry Quiver AIP's "property value hints", which double as autocorrection
 * for misspelled property values — see
 * `docs/foundry-ports/01-grounding-via-summarized-stats.md`.
 *
 * Only fires against columns the caller has already profiled (passed in);
 * it never triggers a profile itself, so it costs nothing when nothing is
 * cached yet.
 */

import type { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

export interface ValueSuggestionFinding {
  readonly rule: 'POSSIBLE_MISSPELLED_VALUE';
  readonly message: string;
}

// Trino VARCHAR equality is case-sensitive, so a case-only difference is a
// real correctness bug (silently zero rows), not just cosmetic — closeness
// is judged case-insensitively, but an exact case-sensitive match is the
// only thing that skips a finding.
const QUOTED_LITERAL_PATTERN = /'((?:[^'\\]|\\.)*)'/g;
const EQUALITY_PATTERN = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*'((?:[^'\\]|\\.)*)'/g;
const IN_LIST_PATTERN =
  /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+IN\s*\(\s*((?:'(?:[^'\\]|\\.)*'\s*,?\s*)+)\)/giu;

// Below this length, a "close" match is nearly guaranteed by chance alone
// (e.g. any 2-char string is edit-distance <=1 from dozens of real values),
// so short literals are left alone rather than risking a wrong suggestion.
const MIN_LITERAL_LENGTH = 3;

export function suggestValueCorrections(
  sql: string,
  profiles: readonly ColumnProfile[],
): readonly ValueSuggestionFinding[] {
  const profileByName = new Map(
    profiles
      .filter((profile) => profile.kind === 'string' && profile.topValues !== undefined)
      .map((profile) => [profile.name.toLowerCase(), profile]),
  );
  if (profileByName.size === 0) return [];

  const findings: ValueSuggestionFinding[] = [];
  const seen = new Set<string>();

  for (const [column, literal] of extractLiterals(sql)) {
    const profile = profileByName.get(column.toLowerCase());
    if (profile?.topValues === undefined) continue;
    const dedupeKey = `${column.toLowerCase()}:${literal}`;
    if (seen.has(dedupeKey)) continue;

    const finding = checkLiteral(column, literal, profile.topValues);
    if (finding !== undefined) {
      seen.add(dedupeKey);
      findings.push(finding);
    }
  }
  return findings;
}

function* extractLiterals(sql: string): Generator<readonly [column: string, literal: string]> {
  for (const match of sql.matchAll(EQUALITY_PATTERN)) {
    const column = match[1];
    const literal = match[2];
    if (column !== undefined && literal !== undefined) yield [column, unescape(literal)];
  }
  for (const match of sql.matchAll(IN_LIST_PATTERN)) {
    const column = match[1];
    const listBody = match[2];
    if (column === undefined || listBody === undefined) continue;
    for (const literalMatch of listBody.matchAll(QUOTED_LITERAL_PATTERN)) {
      const literal = literalMatch[1];
      if (literal !== undefined) yield [column, unescape(literal)];
    }
  }
}

function checkLiteral(
  column: string,
  literal: string,
  topValues: readonly string[],
): ValueSuggestionFinding | undefined {
  if (literal.length < MIN_LITERAL_LENGTH) return undefined;
  if (topValues.includes(literal)) return undefined;

  const threshold = Math.min(3, Math.ceil(literal.length / 3));
  let closest: string | undefined;
  let closestDistance = Infinity;
  for (const value of topValues) {
    const distance = levenshteinDistance(literal.toLowerCase(), value.toLowerCase());
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = value;
    }
  }
  if (closest === undefined || closestDistance > threshold) return undefined;

  return {
    rule: 'POSSIBLE_MISSPELLED_VALUE',
    message:
      `'${literal}' doesn't match any known value of ${column}. ` + `Did you mean '${closest}'?`,
  };
}

function unescape(literal: string): string {
  return literal.replace(/\\(.)/g, '$1');
}

/** Standard Levenshtein edit distance — no dependency exists for this in the repo, and it's short enough not to need one. */
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const previous = Array.from({ length: cols }, (_, index) => index);
  const current = new Array<number>(cols).fill(0);

  for (let row = 1; row < rows; row++) {
    current[0] = row;
    for (let col = 1; col < cols; col++) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      current[col] = Math.min(
        (previous[col] ?? 0) + 1,
        (current[col - 1] ?? 0) + 1,
        (previous[col - 1] ?? 0) + cost,
      );
    }
    previous.splice(0, cols, ...current);
  }
  return previous[cols - 1] ?? 0;
}
