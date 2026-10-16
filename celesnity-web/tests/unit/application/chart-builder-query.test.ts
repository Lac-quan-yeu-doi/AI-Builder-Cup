import { describe, expect, it } from 'vitest';

import {
  expressionText,
  resolvePostAggregationFilterExpression,
} from '@/app/(workspace)/charts/_components/chart-builder-query';
import { makeVisualQuery } from '@/tests/unit/app/chart-builder/chart-builder-test-fixtures';

describe('chart builder query labels', () => {
  it('formats expressions for notebook labels without compiling executable SQL', () => {
    expect(
      expressionText({
        kind: 'BINARY',
        operator: 'GTE',
        left: { kind: 'FIELD', relation: 'orders', field: 'created_at' },
        right: { kind: 'LITERAL', valueType: 'DATE', value: '2026-08-01' },
      }),
    ).toBe('(orders.created_at GTE "2026-08-01")');
  });

  it('resolves a post-aggregation alias to its aggregate expression', () => {
    const query = makeVisualQuery({
      aggregations: [
        {
          alias: 'order_count',
          function: 'COUNT',
          expression: { kind: 'FIELD', relation: 'orders', field: 'id' },
        },
      ],
    });

    expect(resolvePostAggregationFilterExpression(query, 'order_count', 'orders')).toEqual({
      kind: 'CALL',
      function: 'COUNT',
      arguments: [{ kind: 'FIELD', relation: 'orders', field: 'id' }],
    });
  });
});
