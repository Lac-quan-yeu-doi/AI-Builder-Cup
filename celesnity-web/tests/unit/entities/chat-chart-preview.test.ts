import { describe, expect, it } from 'vitest';

import { parseChatChartPreview } from '@/src/entities/models/chat-chart-preview';

const payload = {
  kind: 'preview',
  schema_version: 1,
  title: 'Revenue by region',
  description: null,
  query_definition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  },
  visualization_definition: {
    schemaVersion: 1,
    type: 'BAR',
    roles: { category: 'region', measures: ['revenue'] },
    display: {},
  },
  output_schema: [
    { name: 'region', type: 'varchar', family: 'STRING' },
    { name: 'revenue', type: 'double', family: 'NUMBER' },
  ],
  parameter_values: {},
  rows: [['west', 10]],
  run_id: 'run-1',
  row_count: 1,
  byte_count: 20,
  truncated: false,
  display_truncated: false,
};

describe('parseChatChartPreview', () => {
  it('maps the versioned Core payload once at the message-block boundary', () => {
    expect(parseChatChartPreview(payload)).toMatchObject({
      kind: 'preview',
      schemaVersion: 1,
      title: 'Revenue by region',
      runId: 'run-1',
      queryDefinition: payload.query_definition,
      visualizationDefinition: payload.visualization_definition,
      outputSchema: payload.output_schema,
      rows: [['west', 10]],
      truncated: false,
      displayTruncated: false,
    });
  });

  it.each([
    { ...payload, kind: 'saved' },
    { ...payload, schema_version: 2 },
    { ...payload, query_definition: { schemaVersion: 1, mode: 'NATIVE' } },
    { ...payload, visualization_definition: { schemaVersion: 1, type: 'BAR' } },
    { ...payload, output_schema: [{ name: 'region', type: 'varchar', family: 'WRONG' }] },
    { ...payload, rows: [[{ unsafe: true }]] },
    { ...payload, truncated: 'false' },
    { ...payload, display_truncated: 0 },
  ])('rejects malformed or unsupported payload %#', (candidate) => {
    expect(() => parseChatChartPreview(candidate)).toThrow();
  });
});
