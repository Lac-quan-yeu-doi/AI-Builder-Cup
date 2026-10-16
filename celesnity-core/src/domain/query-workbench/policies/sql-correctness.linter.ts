/**
 * Advisory correctness lint for agent-generated read-only SQL.
 *
 * A module of pure pattern-matching functions, mirroring
 * `read-only-statement.policy.ts`'s "functions, not a class" shape. Every
 * check here is text/regex-based against the raw SQL string only — none
 * needs column types, cardinality, or any other metadata this codebase
 * doesn't already have cheaply, unlike the deferred rules noted below.
 *
 * Findings are advisory, never blocking: `submit()` attaches them to the
 * response so the agent can see and self-correct, but execution always
 * proceeds. Ported from Palantir Foundry's Contour correctness docs — see
 * `docs/foundry-ports/03-query-correctness-cost-linter.md` in the
 * `minder-sys` repo root for the full rule catalogue and rationale for the
 * rules deliberately NOT implemented here: filter-type-vs-column-type
 * (needs `IQueryTargetMetadata` to expose types), join-key uniqueness
 * (needs cardinality metadata, shares infrastructure with the
 * `profile_table` MCP tool), filter-before-join/OR-condition joins (needs a
 * real SQL parser), and timezone bucketing (no fixed-timezone convention
 * exists in this codebase yet).
 */

/** Which lint rule a finding came from. */
export enum SqlLintRule {
  NonDeterministicWindowFunction = 'NON_DETERMINISTIC_WINDOW_FUNCTION',
  StaleTimeFunction = 'STALE_TIME_FUNCTION',
  FloatAggregationDeterminism = 'FLOAT_AGGREGATION_DETERMINISM',
  PreferExactMatch = 'PREFER_EXACT_MATCH',
}

/** One advisory finding: which rule fired, and a human-readable explanation. */
export interface SqlLintFinding {
  readonly rule: SqlLintRule;
  readonly message: string;
}

const NON_DETERMINISTIC_WINDOW_FUNCTIONS =
  '(?:ROW_NUMBER|FIRST|LAST|LEAD|LAG|NTILE|ARRAY_AGG(?:_DISTINCT)?)';

/**
 * Matches `<fn>(...) OVER (PARTITION BY ... ORDER BY <col>)` where the
 * ORDER BY is a single bare column — a heuristic for "probably not a
 * guaranteed-unique tiebreaker." A multi-column ORDER BY, or one that
 * already includes an id-looking column, is assumed to have a real
 * tiebreaker and is not flagged.
 */
const WINDOW_FUNCTION_PATTERN = new RegExp(
  `${NON_DETERMINISTIC_WINDOW_FUNCTIONS}\\s*\\([^)]*\\)\\s*OVER\\s*\\(([^)]*)\\)`,
  'giu',
);
const ORDER_BY_PATTERN = /ORDER\s+BY\s+([^)]+)/iu;
// Matches a column named exactly "id" or ending in "_id" (e.g. order_id) —
// `\b` alone doesn't fire inside "order_id" since underscore is a word
// character, so the suffix is matched explicitly instead.
const ID_LOOKING_COLUMN_PATTERN = /(?:^|_)id$/iu;

function checkNonDeterministicWindowFunctions(sql: string): SqlLintFinding[] {
  const findings: SqlLintFinding[] = [];
  for (const match of sql.matchAll(WINDOW_FUNCTION_PATTERN)) {
    const overClause = match[1] ?? '';
    const orderByMatch = ORDER_BY_PATTERN.exec(overClause);
    const orderByColumns = orderByMatch?.[1]?.trim() ?? '';
    const isSingleColumn = orderByColumns.length > 0 && !orderByColumns.includes(',');
    const looksLikeAKey = ID_LOOKING_COLUMN_PATTERN.test(orderByColumns);
    if (isSingleColumn && !looksLikeAKey) {
      findings.push({
        rule: SqlLintRule.NonDeterministicWindowFunction,
        message:
          `Window function ordered by "${orderByColumns}" alone may not be deterministic if ` +
          'that column has ties. Add a unique tiebreaker column to the ORDER BY.',
      });
    }
  }
  return findings;
}

const STALE_TIME_FUNCTION_PATTERN =
  /\b(CURRENT_DATE|CURRENT_TIMESTAMP|CURRENT_UNIX_TIMESTAMP|MONOTONICALLY_INCREASING_ID)\b/giu;

function checkStaleTimeFunctions(sql: string): SqlLintFinding[] {
  const seen = new Set<string>();
  const findings: SqlLintFinding[] = [];
  for (const match of sql.matchAll(STALE_TIME_FUNCTION_PATTERN)) {
    const fn = match[1]?.toUpperCase() ?? '';
    if (seen.has(fn)) continue;
    seen.add(fn);
    findings.push({
      rule: SqlLintRule.StaleTimeFunction,
      message:
        `${fn} is frozen at the time this result was computed, not "live" — a value ` +
        'read from a materialized/cached result may already be stale.',
    });
  }
  return findings;
}

const FLOAT_AGGREGATION_FUNCTION_PATTERN =
  /\b(mean|avg|sum|stddev|variance|corr|sum_distinct)\s*\(/giu;

function checkFloatAggregationDeterminism(sql: string): SqlLintFinding[] {
  const seen = new Set<string>();
  const findings: SqlLintFinding[] = [];
  for (const match of sql.matchAll(FLOAT_AGGREGATION_FUNCTION_PATTERN)) {
    const fn = match[1]?.toLowerCase() ?? '';
    if (seen.has(fn)) continue;
    seen.add(fn);
    findings.push({
      rule: SqlLintRule.FloatAggregationDeterminism,
      message:
        `${fn}(...) over floating-point values can drift by a tiny margin depending on ` +
        'distributed summation order. Avoid exact-value filtering or joining on this result.',
    });
  }
  return findings;
}

/**
 * `LIKE`/`ILIKE '%...%'` (wildcard on both ends) or any `regexp_like` call.
 * No `g` flag: these are only ever used with `.test()`, and a global-flagged
 * regex's `lastIndex` persists across calls on the same shared instance —
 * pairing `g` with `.test()` here would silently skip matches on every call
 * after the first.
 */
const WILDCARD_BOTH_ENDS_PATTERN = /\b(?:I?LIKE)\s+'%[^']*%'/iu;
const REGEXP_LIKE_PATTERN = /\bregexp_like\s*\(/iu;

function checkPreferExactMatch(sql: string): SqlLintFinding[] {
  const findings: SqlLintFinding[] = [];
  if (WILDCARD_BOTH_ENDS_PATTERN.test(sql)) {
    findings.push({
      rule: SqlLintRule.PreferExactMatch,
      message:
        "A leading-and-trailing-wildcard LIKE ('%...%') can't use an index. If the value " +
        'is known exactly, prefer = or IN instead.',
    });
  }
  if (REGEXP_LIKE_PATTERN.test(sql)) {
    findings.push({
      rule: SqlLintRule.PreferExactMatch,
      message: 'regexp_like is more expensive than an exact match. Prefer = or IN when possible.',
    });
  }
  return findings;
}

/**
 * Runs every advisory correctness check against a SQL string and returns
 * every finding. Never throws — a check that can't parse something it
 * expected simply finds nothing, since a missed warning is a far smaller
 * problem than a linter that can reject a legitimate query.
 */
export function lintSql(sql: string): readonly SqlLintFinding[] {
  return [
    ...checkNonDeterministicWindowFunctions(sql),
    ...checkStaleTimeFunctions(sql),
    ...checkFloatAggregationDeterminism(sql),
    ...checkPreferExactMatch(sql),
  ];
}
