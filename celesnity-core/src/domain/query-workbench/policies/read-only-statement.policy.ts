import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';

/**
 * The read-only SQL policy: one statement, and it must begin with a keyword that
 * cannot write.
 *
 * A module of functions rather than a class. It was a class with a private
 * constructor and nothing but static members, which is a namespace wearing a
 * class's clothes — it can never be instantiated, injected, or substituted, so the
 * class bought nothing and cost a level of indirection at every call site.
 *
 * This is the application half of a two-part control; Trino is also configured
 * read-only. Both halves matter. This one rejects a write before it leaves the
 * process, so nothing depends on the engine's configuration being right, and the
 * caller gets a precise error instead of an engine-level refusal.
 *
 * The approach is a strict allow-list on the leading keyword, not a deny-list of
 * dangerous ones. A deny-list has to anticipate every writing construct Trino
 * supports now and adds later — `MERGE`, `CALL`, `GRANT`, `REFRESH`, `PREPARE`,
 * `SET SESSION` — and a keyword nobody thought of defaults to permitted. Here a
 * keyword nobody thought of defaults to rejected.
 */

/**
 * Leading keywords that cannot modify data or schema. `TABLE x` is shorthand for
 * `SELECT * FROM x`, and `VALUES` is a standalone row constructor; both are reads.
 */
const READ_ONLY_LEADING_KEYWORDS: ReadonlySet<string> = new Set<string>([
  'SELECT',
  'WITH',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'EXPLAIN',
  'TABLE',
  'VALUES',
]);

/** Modifiers that may sit between `EXPLAIN` and the statement it explains. */
const EXPLAIN_MODIFIER_PATTERN = /^(ANALYZE|VERBOSE)\b/iu;

const LEADING_KEYWORD_PATTERN = /^[A-Za-z][A-Za-z0-9_]*/u;

/** Whether `sqlText` satisfies the policy, without raising. */
export function isReadOnlyStatement(sqlText: string): boolean {
  try {
    assertReadOnlyStatement(sqlText);
    return true;
  } catch {
    return false;
  }
}

/**
 * Raises a read-only violation unless `sqlText` is a single, non-writing
 * statement.
 */
export function assertReadOnlyStatement(sqlText: string): void {
  assertLeadingKeywordAllowed(requireSingleStatement(sqlText));
}

/**
 * Reduces the input to one statement, or rejects it.
 *
 * Literals and comments are blanked first, so neither a semicolon nor a keyword
 * hidden inside `'...'`, `"..."`, `-- ...` or a block comment can influence the
 * decision. A single trailing semicolon is normal punctuation; a semicolon
 * anywhere else means a second statement is being smuggled in behind the first.
 */
function requireSingleStatement(sqlText: string): string {
  const sanitized = blankLiteralsAndComments(sqlText);
  if (sanitized.trim().length === 0) {
    throw SqlExecutionError.readOnlyViolation(SqlExecutionMessage.emptyStatement);
  }

  const withoutTrailing = sanitized.replace(/;\s*$/u, '');
  if (withoutTrailing.includes(';')) {
    throw SqlExecutionError.readOnlyViolation(SqlExecutionMessage.multipleStatements);
  }
  return withoutTrailing.trim();
}

function assertLeadingKeywordAllowed(sanitizedStatement: string): void {
  const candidate = unwrapParentheses(sanitizedStatement);
  const leadingKeyword = leadingKeywordOf(candidate);
  if (leadingKeyword === undefined || !READ_ONLY_LEADING_KEYWORDS.has(leadingKeyword)) {
    throw SqlExecutionError.readOnlyViolation(SqlExecutionMessage.notReadOnly);
  }

  // `EXPLAIN ANALYZE` executes the statement it is given, so `EXPLAIN` alone
  // proves nothing about what follows and the remainder is checked in turn.
  if (leadingKeyword === 'EXPLAIN') {
    assertExplainTargetReadOnly(candidate);
  }
}

function assertExplainTargetReadOnly(explainStatement: string): void {
  let remainder = explainStatement.slice('EXPLAIN'.length).trimStart();

  // `EXPLAIN ANALYZE VERBOSE ...` — either modifier may appear, in either order.
  for (;;) {
    const stripped = remainder.replace(EXPLAIN_MODIFIER_PATTERN, '').trimStart();
    if (stripped === remainder) {
      break;
    }
    remainder = stripped;
  }

  // An option list such as `EXPLAIN (TYPE LOGICAL) SELECT ...` precedes the
  // statement and is skipped whole.
  if (remainder.startsWith('(')) {
    const closingIndex = remainder.indexOf(')');
    if (closingIndex === -1) {
      // Unbalanced, so the statement being explained cannot be identified. It is
      // rejected rather than guessed at.
      throw SqlExecutionError.readOnlyViolation(SqlExecutionMessage.notReadOnly);
    }
    remainder = remainder.slice(closingIndex + 1).trimStart();
  }

  assertLeadingKeywordAllowed(remainder);
}

/** Strips wrapping parentheses, as in `(SELECT ...)` or `((SELECT ...))`. */
function unwrapParentheses(statement: string): string {
  let candidate = statement;
  while (candidate.startsWith('(')) {
    candidate = candidate.slice(1).trimStart();
  }
  return candidate;
}

function leadingKeywordOf(statement: string): string | undefined {
  const match = LEADING_KEYWORD_PATTERN.exec(statement.trimStart());
  return match === null ? undefined : match[0].toUpperCase();
}

/**
 * Replaces string literals and quoted identifiers with a placeholder and removes
 * comments, so keyword and semicolon inspection cannot be fooled by their
 * contents.
 *
 * A quoted identifier becomes ` x ` rather than a bare space: it stands where a
 * name stood, and collapsing it to nothing could let neighbouring tokens fuse
 * into a keyword that was not written.
 *
 * An unterminated literal or comment consumes the rest of the input. That is the
 * safe direction: everything after it disappears, so it cannot contribute a
 * keyword, and if nothing legible remains the statement is rejected as empty.
 */
function blankLiteralsAndComments(sqlText: string): string {
  let result = '';
  let index = 0;
  const length = sqlText.length;

  while (index < length) {
    const char = sqlText[index];
    const nextChar = index + 1 < length ? sqlText[index + 1] : '';

    if (char === '-' && nextChar === '-') {
      index += 2;
      while (index < length && sqlText[index] !== '\n') {
        index += 1;
      }
      result += ' ';
      continue;
    }

    if (char === '/' && nextChar === '*') {
      index += 2;
      while (index < length && !(sqlText[index] === '*' && sqlText[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      result += ' ';
      continue;
    }

    if (char === "'") {
      index = skipQuoted(sqlText, index, "'");
      result += ' ';
      continue;
    }

    if (char === '"') {
      index = skipQuoted(sqlText, index, '"');
      result += ' x ';
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/**
 * Advances past a quoted run that starts at `openIndex`, honouring SQL's doubled
 * quote escape (`''` inside a literal, `""` inside an identifier). Returns the
 * index just past the closing quote, or the end of input when unterminated.
 */
function skipQuoted(sqlText: string, openIndex: number, quote: string): number {
  let index = openIndex + 1;
  const length = sqlText.length;

  while (index < length) {
    if (sqlText[index] !== quote) {
      index += 1;
      continue;
    }
    if (sqlText[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return length;
}
