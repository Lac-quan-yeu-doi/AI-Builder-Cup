import {
  assertReadOnlyStatement,
  isReadOnlyStatement,
} from '@domain/query-workbench/policies/read-only-statement.policy';
import {
  SqlExecutionError,
  SqlExecutionErrorCode,
} from '@domain/query-workbench/errors/sql-execution.errors';

/**
 * The read-only policy is a security control, so this is the most adversarial
 * suite in the repository.
 *
 * It matters because the policy is a hand-written lexer standing between an
 * arbitrary user string and a query engine. Two classes of bug are possible and
 * both are tested for explicitly:
 *
 *  - a *false accept*, where a writing statement is judged read-only. That is the
 *    dangerous direction, so most cases here are attempts to smuggle one through:
 *    comments, quoting, parentheses, `EXPLAIN ANALYZE`, and stacked statements.
 *  - a *false reject*, where a legitimate query is refused. That is merely
 *    annoying, but a policy that rejects `WITH` would be discovered in production
 *    rather than here.
 *
 * `isReadOnlyStatement` is the predicate; `assertReadOnlyStatement` raises. Both
 * are exercised, because a caller relying on the predicate must not disagree with
 * a caller relying on the assertion.
 */

function accepts(sql: string): boolean {
  return isReadOnlyStatement(sql);
}

describe('assertReadOnlyStatement — accepted read-only forms', () => {
  const allowed: readonly string[] = [
    'SELECT 1',
    'select * from orders',
    '  SELECT 1  ',
    'SELECT 1;',
    'SELECT 1;   \n  ',
    'WITH recent AS (SELECT 1) SELECT * FROM recent',
    'SHOW TABLES',
    'SHOW SCHEMAS FROM iceberg',
    'DESCRIBE orders',
    'DESC orders',
    'EXPLAIN SELECT 1',
    'TABLE orders',
    'VALUES (1), (2)',
    '(SELECT 1)',
    '((SELECT 1))',
    '( SELECT 1 )',
  ];

  it.each(allowed)('accepts %j', (sql) => {
    expect(() => {
      assertReadOnlyStatement(sql);
    }).not.toThrow();
    expect(accepts(sql)).toBe(true);
  });

  it('is case-insensitive about the leading keyword', () => {
    expect(accepts('sElEcT 1')).toBe(true);
  });
});

describe('assertReadOnlyStatement — writes and schema changes', () => {
  const rejected: readonly string[] = [
    'INSERT INTO orders VALUES (1)',
    'UPDATE orders SET total = 0',
    'DELETE FROM orders',
    'MERGE INTO orders USING staged ON true WHEN MATCHED THEN DELETE',
    'CREATE TABLE t (a int)',
    'CREATE OR REPLACE VIEW v AS SELECT 1',
    'DROP TABLE orders',
    'ALTER TABLE orders ADD COLUMN a int',
    'TRUNCATE TABLE orders',
    'GRANT SELECT ON orders TO alice',
    'REVOKE SELECT ON orders FROM alice',
    'CALL system.sync()',
    'SET SESSION x = 1',
    'RESET SESSION x',
    'COMMENT ON TABLE orders IS $$x$$',
    'REFRESH MATERIALIZED VIEW v',
    'ANALYZE orders',
    'PREPARE p FROM SELECT 1',
    'EXECUTE p',
    'DEALLOCATE PREPARE p',
    'USE iceberg.main',
    'START TRANSACTION',
    'COMMIT',
    'ROLLBACK',
    'BEGIN',
  ];

  it.each(rejected)('rejects %j', (sql) => {
    expect(() => {
      assertReadOnlyStatement(sql);
    }).toThrow(SqlExecutionError);
    expect(accepts(sql)).toBe(false);
  });

  it('reports a read-only violation rather than a generic validation error', () => {
    expect.assertions(1);
    try {
      assertReadOnlyStatement('DELETE FROM orders');
    } catch (error: unknown) {
      expect((error as SqlExecutionError).code).toBe(SqlExecutionErrorCode.READ_ONLY_VIOLATION);
    }
  });

  it('rejects an unknown leading keyword rather than defaulting to allowed', () => {
    // The allow-list's whole purpose: a construct nobody anticipated is refused.
    expect(accepts('VACUUM orders')).toBe(false);
    expect(accepts('FLUSH PRIVILEGES')).toBe(false);
    expect(accepts('WHATEVER 1')).toBe(false);
  });
});

describe('assertReadOnlyStatement — stacked statements', () => {
  it('rejects a write appended after a read', () => {
    expect(accepts('SELECT 1; DROP TABLE orders')).toBe(false);
  });

  it('rejects a second read as well, since only one statement may be submitted', () => {
    expect(accepts('SELECT 1; SELECT 2')).toBe(false);
  });

  it('rejects a trailing semicolon followed by anything at all', () => {
    expect(accepts('SELECT 1;;')).toBe(false);
  });

  it('allows exactly one trailing semicolon with trailing whitespace', () => {
    expect(accepts('SELECT 1 ;  ')).toBe(true);
  });

  it('does not treat a semicolon inside a string literal as a statement break', () => {
    expect(accepts("SELECT ';'")).toBe(true);
    expect(accepts("SELECT 'a; DROP TABLE orders'")).toBe(true);
  });

  it('does not treat a semicolon inside a quoted identifier as a statement break', () => {
    expect(accepts('SELECT "a;b" FROM t')).toBe(true);
  });

  it('does not treat a semicolon inside a comment as a statement break', () => {
    expect(accepts('SELECT 1 -- ; DROP TABLE orders')).toBe(true);
    expect(accepts('SELECT 1 /* ; DROP TABLE orders */')).toBe(true);
  });
});

describe('assertReadOnlyStatement — comment and quote evasion', () => {
  it('rejects a write hidden behind a leading line comment', () => {
    expect(accepts('-- SELECT 1\nDELETE FROM orders')).toBe(false);
  });

  it('rejects a write hidden behind a leading block comment', () => {
    expect(accepts('/* SELECT 1 */ DELETE FROM orders')).toBe(false);
  });

  it('accepts a read preceded by a comment', () => {
    expect(accepts('-- a note\nSELECT 1')).toBe(true);
    expect(accepts('/* a note */ SELECT 1')).toBe(true);
  });

  it('rejects a statement that is only a comment', () => {
    expect(accepts('-- nothing here')).toBe(false);
    expect(accepts('/* nothing here */')).toBe(false);
  });

  it('does not let a comment splice two fragments into an allowed keyword', () => {
    // `SEL/**/ECT` must not become `SELECT`; the comment is replaced by a space.
    expect(accepts('SEL/**/ECT 1')).toBe(false);
  });

  it('does not let a quoted identifier splice fragments into an allowed keyword', () => {
    // A quoted identifier is replaced by ` x `, never by nothing.
    expect(accepts('SEL""ECT 1')).toBe(false);
  });

  it('handles a doubled quote escape inside a string literal', () => {
    expect(accepts("SELECT 'it''s fine'")).toBe(true);
  });

  it('handles a doubled quote escape inside a quoted identifier', () => {
    expect(accepts('SELECT "we""ird" FROM t')).toBe(true);
  });

  it('does not mistake an escaped quote for the end of a literal', () => {
    // If `''` were read as a terminator, the `; DROP` would escape the literal.
    expect(accepts("SELECT 'a''; DROP TABLE orders'")).toBe(true);
  });

  it('consumes the remainder when a literal is never closed', () => {
    // Everything after the opening quote vanishes, so nothing can be smuggled in.
    expect(accepts("SELECT 'unterminated ; DROP TABLE orders")).toBe(true);
    expect(accepts("DELETE FROM orders WHERE a = 'unterminated")).toBe(false);
  });

  it('consumes the remainder when a block comment is never closed', () => {
    expect(accepts('SELECT 1 /* unterminated ; DROP TABLE orders')).toBe(true);
  });

  it('rejects a statement that becomes empty once a comment is stripped', () => {
    expect(accepts('/* unterminated')).toBe(false);
  });
});

describe('assertReadOnlyStatement — EXPLAIN', () => {
  it('accepts EXPLAIN of a read', () => {
    expect(accepts('EXPLAIN SELECT 1')).toBe(true);
  });

  it('rejects EXPLAIN of a write, because EXPLAIN ANALYZE actually runs it', () => {
    expect(accepts('EXPLAIN DELETE FROM orders')).toBe(false);
    expect(accepts('EXPLAIN ANALYZE DELETE FROM orders')).toBe(false);
    expect(accepts('EXPLAIN ANALYZE INSERT INTO orders VALUES (1)')).toBe(false);
  });

  it('accepts EXPLAIN ANALYZE of a read', () => {
    expect(accepts('EXPLAIN ANALYZE SELECT 1')).toBe(true);
  });

  it('handles the VERBOSE modifier in either order', () => {
    expect(accepts('EXPLAIN VERBOSE SELECT 1')).toBe(true);
    expect(accepts('EXPLAIN ANALYZE VERBOSE SELECT 1')).toBe(true);
    expect(accepts('EXPLAIN VERBOSE ANALYZE SELECT 1')).toBe(true);
    expect(accepts('EXPLAIN ANALYZE VERBOSE DELETE FROM orders')).toBe(false);
  });

  it('skips a parenthesised option list before checking the target', () => {
    expect(accepts('EXPLAIN (TYPE LOGICAL) SELECT 1')).toBe(true);
    expect(accepts('EXPLAIN (TYPE LOGICAL) DELETE FROM orders')).toBe(false);
  });

  it('rejects an EXPLAIN whose option list is never closed', () => {
    // The target cannot be identified, so it is refused rather than guessed.
    expect(accepts('EXPLAIN (TYPE LOGICAL SELECT 1')).toBe(false);
  });

  it('rejects a bare EXPLAIN with no target', () => {
    expect(accepts('EXPLAIN')).toBe(false);
  });

  it('rejects nested EXPLAIN of a write', () => {
    expect(accepts('EXPLAIN EXPLAIN ANALYZE DROP TABLE orders')).toBe(false);
  });

  it('accepts nested EXPLAIN of a read', () => {
    expect(accepts('EXPLAIN EXPLAIN SELECT 1')).toBe(true);
  });
});

describe('assertReadOnlyStatement — empty and degenerate input', () => {
  const empty: readonly string[] = ['', '   ', '\n\t ', ';', '  ;  '];

  it.each(empty)('rejects %j as empty', (sql) => {
    expect(accepts(sql)).toBe(false);
  });

  it('reports the empty-statement message for blank input', () => {
    expect(() => {
      assertReadOnlyStatement('   ');
    }).toThrow('A non-empty SQL statement is required.');
  });

  it('reports the multiple-statements message for stacked input', () => {
    expect(() => {
      assertReadOnlyStatement('SELECT 1; SELECT 2');
    }).toThrow('Only a single read-only SQL statement may be submitted.');
  });

  it('rejects a statement that starts with punctuation rather than a keyword', () => {
    expect(accepts('* FROM orders')).toBe(false);
    expect(accepts('123')).toBe(false);
  });

  it('rejects unbalanced opening parentheses with no statement inside', () => {
    expect(accepts('(((')).toBe(false);
  });

  it('does not treat a keyword prefix as the keyword itself', () => {
    // `SELECTED` is a different token; matching a prefix would be a false accept.
    expect(accepts('SELECTED 1')).toBe(false);
    expect(accepts('WITHOUT 1')).toBe(false);
    expect(accepts('SHOWING 1')).toBe(false);
  });
});
