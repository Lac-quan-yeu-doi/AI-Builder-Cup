import { describe, expect, it } from 'vitest';

import type { VisualQueryDefinition } from '@/src/entities/models/canonical-chart';
import { projectVisualQueryPreview } from '@/src/application/use-cases/canonical-charts/project-visual-query-preview.use-case';

const query: VisualQueryDefinition = {
  schemaVersion: 1,
  mode: 'VISUAL',
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  source: {
    table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
    alias: 'orders',
  },
  joins: [
    {
      type: 'INNER',
      table: { catalog: 'iceberg', schema: 'analytics', table: 'brands' },
      alias: 'brands',
      conditions: [
        {
          left: { kind: 'FIELD', relation: 'orders', field: 'brand_id' },
          operator: 'EQ',
          right: { kind: 'FIELD', relation: 'brands', field: 'id' },
        },
      ],
    },
  ],
  projections: [
    {
      alias: 'order_id',
      expression: { kind: 'FIELD', relation: 'orders', field: 'id' },
    },
  ],
  customExpressions: [
    {
      alias: 'gross',
      expression: { kind: 'LITERAL', valueType: 'NUMBER', value: 1 },
    },
  ],
  filters: [
    {
      kind: 'BINARY',
      operator: 'EQ',
      left: { kind: 'FIELD', relation: 'orders', field: 'status' },
      right: { kind: 'LITERAL', valueType: 'STRING', value: 'PAID' },
    },
  ],
  aggregations: [
    {
      alias: 'order_count',
      function: 'COUNT',
      expression: { kind: 'LITERAL', valueType: 'NUMBER', value: 1 },
    },
  ],
  breakouts: [{ kind: 'FIELD', relation: 'brands', field: 'name' }],
  postAggregationFilters: [
    {
      kind: 'BINARY',
      operator: 'GT',
      left: {
        kind: 'CALL',
        function: 'COUNT',
        arguments: [{ kind: 'LITERAL', valueType: 'NUMBER', value: 1 }],
      },
      right: { kind: 'LITERAL', valueType: 'NUMBER', value: 5 },
    },
  ],
  orderBy: [
    {
      expression: { kind: 'FIELD', relation: 'brands', field: 'name' },
      direction: 'ASC',
    },
  ],
  limit: 200,
};

describe('projectVisualQueryPreview', () => {
  it('projects each notebook stage without mutating the visual query', () => {
    const data = projectVisualQueryPreview(query, 'DATA');
    expect(data).toMatchObject({
      joins: [],
      filters: [],
      aggregations: [],
      breakouts: [],
      postAggregationFilters: [],
      orderBy: [],
      limit: undefined,
      projections: query.projections,
      customExpressions: query.customExpressions,
    });

    const join = projectVisualQueryPreview(query, 'JOIN');
    expect(join.joins).toHaveLength(query.joins.length);
    expect(join.filters).toEqual([]);
    expect(join.aggregations).toEqual([]);

    const filter = projectVisualQueryPreview(query, 'FILTER');
    expect(filter.filters).toEqual(query.filters);
    expect(filter.aggregations).toEqual([]);
    expect(filter.postAggregationFilters).toEqual([]);

    const summarize = projectVisualQueryPreview(query, 'SUMMARIZE');
    expect(summarize.aggregations).toEqual(query.aggregations);
    expect(summarize.breakouts).toEqual(query.breakouts);
    expect(summarize.postAggregationFilters).toEqual(query.postAggregationFilters);
    expect(summarize.orderBy).toEqual([]);
    expect(summarize.limit).toBeUndefined();

    const sortLimit = projectVisualQueryPreview(query, 'SORT_LIMIT');
    expect(sortLimit).toEqual(query);
    expect(sortLimit).not.toBe(query);
    expect(sortLimit.joins).not.toBe(query.joins);
    expect(sortLimit.orderBy).not.toBe(query.orderBy);
    expect(query.filters).toHaveLength(1);
  });
});
