import {
  validateQueryDefinition,
  type VisualQueryDefinition,
  type QueryDefinition,
} from '@domain/chart/models/query-definition';

describe('validateQueryDefinition', () => {
  const query: VisualQueryDefinition = {
    schemaVersion: 1,
    mode: 'VISUAL',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    source: {
      table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
      alias: 'o',
    },
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
  };

  it('accepts a visual definition with a valid joined relation', () => {
    expect(() => validateQueryDefinition(query)).not.toThrow();
  });

  it('rejects duplicate relation aliases', () => {
    const duplicateAlias: QueryDefinition = {
      ...query,
      joins: [{ ...query.joins[0]!, alias: 'o' }],
    };

    expect(() => validateQueryDefinition(duplicateAlias)).toThrow('QUERY_INVALID');
  });

  it('accepts a bounded visual-query row limit', () => {
    expect(() => validateQueryDefinition({ ...query, limit: 2_000 })).not.toThrow();
  });

  it.each([0, 10_001, 1.5])('rejects an unsafe visual-query row limit: %s', (limit) => {
    expect(() => validateQueryDefinition({ ...query, limit })).toThrow('QUERY_INVALID');
  });

  it('rejects equality comparisons with NULL before compilation', () => {
    expect(() =>
      validateQueryDefinition({
        ...query,
        filters: [
          {
            kind: 'BINARY',
            operator: 'EQ',
            left: { kind: 'FIELD', relation: 'o', field: 'is_deleted' },
            right: { kind: 'LITERAL', valueType: 'NULL', value: null },
          },
        ],
      }),
    ).toThrow('NULL cannot be compared');
  });
});
