import {
  canonicalWriteKeys,
  decodeQueryDefinition,
  decodeVisualizationDefinition,
  encodeQueryDefinition,
} from '@infrastructure/prisma/chart/chart-json.mapper';
import type { QueryDefinition } from '@domain/chart/models/query-definition';

describe('chart JSON mapper', () => {
  const query: QueryDefinition = {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  };

  it('round-trips a validated query definition', () => {
    expect(decodeQueryDefinition(encodeQueryDefinition(query))).toEqual(query);
  });

  it('rejects an unsupported visualization schema', () => {
    expect(() => decodeVisualizationDefinition({ schemaVersion: 99 })).toThrow(
      'CHART_TYPE_UNSUPPORTED',
    );
  });

  it('does not expose legacy rows or Vega-Lite output to canonical persistence', () => {
    expect(canonicalWriteKeys).not.toContain('data');
    expect(canonicalWriteKeys).not.toContain('vlSpec');
  });
});
