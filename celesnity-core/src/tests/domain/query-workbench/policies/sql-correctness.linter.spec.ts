import { lintSql, SqlLintRule } from '@domain/query-workbench/policies/sql-correctness.linter';

describe('lintSql — window-function tie-break', () => {
  it('flags ROW_NUMBER ordered by a single non-key-looking column', () => {
    const findings = lintSql(
      'SELECT ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) FROM orders',
    );
    expect(findings.map((f) => f.rule)).toContain(SqlLintRule.NonDeterministicWindowFunction);
  });

  it('does not flag a window function ordered by an id-looking column', () => {
    const findings = lintSql(
      'SELECT ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_id) FROM orders',
    );
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.NonDeterministicWindowFunction);
  });

  it('does not flag a query with no window functions', () => {
    const findings = lintSql('SELECT * FROM orders');
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.NonDeterministicWindowFunction);
  });
});

describe('lintSql — stale time functions', () => {
  it.each([
    'CURRENT_DATE',
    'CURRENT_TIMESTAMP',
    'CURRENT_UNIX_TIMESTAMP',
    'MONOTONICALLY_INCREASING_ID()',
  ])('flags %s', (fn) => {
    const findings = lintSql(`SELECT ${fn} FROM orders`);
    expect(findings.map((f) => f.rule)).toContain(SqlLintRule.StaleTimeFunction);
  });

  it('does not flag a query without any of these functions', () => {
    const findings = lintSql('SELECT order_date FROM orders');
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.StaleTimeFunction);
  });
});

describe('lintSql — float aggregation determinism', () => {
  it.each(['mean', 'avg', 'sum', 'stddev', 'variance', 'corr', 'sum_distinct'])(
    'flags %s(...)',
    (fn) => {
      const findings = lintSql(`SELECT ${fn}(amount) FROM orders`);
      expect(findings.map((f) => f.rule)).toContain(SqlLintRule.FloatAggregationDeterminism);
    },
  );

  it('does not flag count(...)', () => {
    const findings = lintSql('SELECT count(*) FROM orders');
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.FloatAggregationDeterminism);
  });
});

describe('lintSql — contains/regex vs exact match', () => {
  it('flags a leading-and-trailing-wildcard LIKE', () => {
    const findings = lintSql("SELECT * FROM orders WHERE status LIKE '%shipped%'");
    expect(findings.map((f) => f.rule)).toContain(SqlLintRule.PreferExactMatch);
  });

  it('flags ILIKE the same way', () => {
    const findings = lintSql("SELECT * FROM orders WHERE status ILIKE '%shipped%'");
    expect(findings.map((f) => f.rule)).toContain(SqlLintRule.PreferExactMatch);
  });

  it('flags regexp_like', () => {
    const findings = lintSql("SELECT * FROM orders WHERE regexp_like(status, 'shipped')");
    expect(findings.map((f) => f.rule)).toContain(SqlLintRule.PreferExactMatch);
  });

  it('does not flag an exact-match filter', () => {
    const findings = lintSql("SELECT * FROM orders WHERE status = 'shipped'");
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.PreferExactMatch);
  });

  it('does not flag a prefix-only LIKE, since a leading wildcard is the expensive case', () => {
    const findings = lintSql("SELECT * FROM orders WHERE status LIKE 'ship%'");
    expect(findings.map((f) => f.rule)).not.toContain(SqlLintRule.PreferExactMatch);
  });
});

describe('lintSql — clean query', () => {
  it('returns no findings for a simple, well-formed query', () => {
    const findings = lintSql('SELECT id, status FROM orders WHERE status = $1');
    expect(findings).toEqual([]);
  });
});
