import { VisualQueryCompiler } from '@application/chart/query/visual-query.compiler';

describe('VisualQueryCompiler', () => {
  const visualQuery = {
    schemaVersion: 1 as const,
    mode: 'VISUAL' as const,
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    source: { table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' }, alias: 'o' },
    joins: [],
    projections: [],
    customExpressions: [],
    filters: [],
    aggregations: [],
    breakouts: [],
    postAggregationFilters: [],
    orderBy: [],
  };

  it('compiles the requested safe row limit', () => {
    const compiler = new VisualQueryCompiler();
    const compiled = compiler.compile({ ...visualQuery, limit: 2_000 });

    expect(compiled.sql).toMatch(/LIMIT 2000$/);
  });

  it('defaults omitted row limits to the runtime maximum', () => {
    const compiler = new VisualQueryCompiler();
    const compiled = compiler.compile(visualQuery);

    expect(compiled.sql).toMatch(/LIMIT 10000$/);
  });

  it('compiles DATE and BOOLEAN literals with Trino types', () => {
    const compiler = new VisualQueryCompiler();
    const compiled = compiler.compile({
      ...visualQuery,
      filters: [
        {
          kind: 'BINARY',
          operator: 'GTE',
          left: { kind: 'FIELD', relation: 'o', field: 'created_at' },
          right: { kind: 'LITERAL', valueType: 'DATE', value: '2026-09-01' },
        },
        {
          kind: 'BINARY',
          operator: 'EQ',
          left: { kind: 'FIELD', relation: 'o', field: 'is_deleted' },
          right: { kind: 'LITERAL', valueType: 'BOOLEAN', value: false },
        },
      ],
    });

    expect(compiled.sql).toContain(`"o"."created_at" >= DATE '2026-09-01'`);
    expect(compiled.sql).toContain('"o"."is_deleted" = FALSE');
  });

  it('quotes every trusted relation identifier in a joined query', () => {
    const compiler = new VisualQueryCompiler();
    const sql = compiler.compile({
      schemaVersion: 1,
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'analytics' },
      parameters: [],
      source: { table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' }, alias: 'o' },
      joins: [
        {
          type: 'LEFT',
          table: { catalog: 'iceberg', schema: 'analytics', table: 'customers' },
          alias: 'c',
          conditions: [
            {
              left: { kind: 'FIELD', relation: 'o', field: 'customer_id' },
              operator: 'EQ',
              right: { kind: 'FIELD', relation: 'c', field: 'id' },
            },
          ],
        },
      ],
      projections: [],
      customExpressions: [],
      filters: [],
      aggregations: [],
      breakouts: [],
      postAggregationFilters: [],
      orderBy: [],
    });

    expect(sql.sql).toContain(
      'LEFT JOIN "iceberg"."analytics"."customers" AS "c" ON "o"."customer_id" = "c"."id"',
    );
  });

  it('quotes physical table and column identifiers that begin with a digit', () => {
    const compiler = new VisualQueryCompiler();
    const sql = compiler.compile({
      ...visualQuery,
      context: { catalog: '123', schema: '456' },
      source: {
        table: { catalog: '123', schema: '456', table: '321654' },
        alias: '321654',
      },
      projections: [
        {
          alias: '2026',
          expression: { kind: 'FIELD', relation: '321654', field: '2026' },
        },
      ],
    });

    expect(sql.sql).toBe(
      'SELECT "321654"."2026" AS "2026" FROM "123"."456"."321654" AS "321654" LIMIT 10000',
    );
  });

  it('compiles a post-aggregation filter against the aggregate expression', () => {
    const compiler = new VisualQueryCompiler();
    const sql = compiler.compile({
      schemaVersion: 1,
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'analytics' },
      parameters: [],
      source: { table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' }, alias: 'o' },
      joins: [],
      projections: [],
      customExpressions: [],
      filters: [],
      aggregations: [
        {
          alias: 'sum_revenue',
          function: 'SUM',
          expression: { kind: 'FIELD', relation: 'o', field: 'revenue' },
        },
      ],
      breakouts: [{ kind: 'FIELD', relation: 'o', field: 'region' }],
      postAggregationFilters: [
        {
          kind: 'BINARY',
          operator: 'GTE',
          left: {
            kind: 'CALL',
            function: 'SUM',
            arguments: [{ kind: 'FIELD', relation: 'o', field: 'revenue' }],
          },
          right: { kind: 'LITERAL', valueType: 'NUMBER', value: 100 },
        },
      ],
      orderBy: [],
    });

    expect(sql.sql).toContain('HAVING (SUM("o"."revenue") >= 100)');
  });
});
