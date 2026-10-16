import { describe, expect, it } from 'vitest';

import {
  artifactKindOf,
  artifactRowCountOf,
  artifactTitleOf,
  isArtifactBlock,
  readTableBlock,
  tableFromChartPreview,
} from '@/app/_components/chat/message-block-content';
import type { MessageBlock } from '@/app/_components/chat/types';
import {
  blockArtifactId,
  messageBlockArtifact,
} from '@/app/(workspace)/chat/_components/stage/message-block-artifact';
import { createTranslator } from '@/app/_i18n/translate';
import { parseChatChartPreview } from '@/src/entities/models/chat-chart-preview';

const t = createTranslator('en');

function block(overrides: Partial<MessageBlock> & Pick<MessageBlock, 'blockType'>): MessageBlock {
  return {
    id: 'b1',
    runId: 'run-1',
    payload: {},
    fallbackText: 'fallback',
    ...overrides,
  };
}

const chartPayload = {
  kind: 'preview',
  schema_version: 1,
  title: 'Output per line',
  description: 'Seven days of output.',
  query_definition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'factory' },
    parameters: [],
    sql: 'select day, units from output',
  },
  visualization_definition: { schemaVersion: 1, type: 'BAR', roles: {}, display: {} },
  output_schema: [
    { name: 'day', type: 'varchar', family: 'STRING' },
    { name: 'units', type: 'bigint', family: 'NUMBER' },
  ],
  parameter_values: {},
  rows: [
    ['Mon', 410],
    ['Tue', 520],
  ],
  run_id: 'run-9',
  row_count: 2,
  byte_count: 64,
  truncated: false,
  display_truncated: false,
};

describe('readTableBlock', () => {
  it('reads title, columns and rows out of an unschematised payload', () => {
    const content = readTableBlock({
      title: 'Late orders',
      columns: [
        { key: 'order', label: 'Order' },
        { key: 'units', label: 'Units' },
      ],
      rows: [
        { order: 'SO-1', units: 120 },
        { order: 'SO-2', units: 340 },
      ],
      footnote: 'Two are overdue.',
    });

    expect(content.title).toBe('Late orders');
    expect(content.rows).toHaveLength(2);
    expect(content.footnote).toBe('Two are overdue.');
  });

  it('marks a column numeric only when every value present is a number', () => {
    const content = readTableBlock({
      columns: [{ key: 'units' }, { key: 'note' }, { key: 'blank' }],
      rows: [
        { units: 1, note: 'a', blank: null },
        { units: 2, note: 3, blank: '' },
      ],
    });

    expect(content.columns.map((column) => [column.key, column.numeric])).toEqual([
      ['units', true],
      /* One number among text is still a text column. */
      ['note', false],
      /* Nothing to line up, so nothing to right-align. */
      ['blank', false],
    ]);
  });

  it('falls back to the column index when a column has no key', () => {
    const content = readTableBlock({ columns: [{ label: 'First' }], rows: [] });
    expect(content.columns[0]).toEqual({ key: '0', label: 'First', numeric: false });
  });

  it('survives a payload that is not a table at all', () => {
    const content = readTableBlock({ columns: 'nope', rows: [null, 7, { a: 1 }] });
    expect(content.columns).toEqual([]);
    expect(content.rows).toEqual([{ a: 1 }]);
  });
});

describe('artifact block identity', () => {
  it('treats only chart and table blocks as artifacts', () => {
    expect(isArtifactBlock(block({ blockType: 'chart' }))).toBe(true);
    expect(isArtifactBlock(block({ blockType: 'table' }))).toBe(true);
    for (const kind of ['text', 'markdown', 'image', 'file'] as const) {
      expect(isArtifactBlock(block({ blockType: kind })), kind).toBe(false);
    }
  });

  it('namespaces the stage id so it cannot collide with a library pane', () => {
    expect(blockArtifactId('b1')).toBe('block:b1');
    expect(blockArtifactId('b1')).not.toBe('chart:list');
  });

  it('reads a chart block title and row count from its payload', () => {
    const chart = block({ blockType: 'chart', payload: chartPayload });
    expect(artifactTitleOf(chart)).toBe('Output per line');
    expect(artifactRowCountOf(chart)).toBe(2);
    expect(artifactKindOf(chart)).toBe('chart');
  });

  it('reports no row count for a chart payload it cannot parse', () => {
    const broken = block({ blockType: 'chart', payload: { kind: 'not-a-preview' } });
    expect(artifactTitleOf(broken)).toBeNull();
    expect(artifactRowCountOf(broken)).toBeNull();
  });

  it('treats a created document block as an artifact named by its filename', () => {
    const documentBlock = block({
      blockType: 'document' as MessageBlock['blockType'],
      payload: { document_id: 'doc-1', filename: 'daily-report.md' },
    });

    expect(isArtifactBlock(documentBlock)).toBe(true);
    expect(artifactKindOf(documentBlock)).toBe('document');
    expect(artifactTitleOf(documentBlock)).toBe('daily-report.md');
    expect(artifactRowCountOf(documentBlock)).toBeNull();
  });
});

describe('messageBlockArtifact', () => {
  it('builds a stage artifact from a chart block', () => {
    expect(messageBlockArtifact(block({ blockType: 'chart', payload: chartPayload }), t)).toEqual({
      id: 'block:b1',
      kind: 'chart',
      title: 'Output per line',
      meta: 'Chart · 2 rows',
    });
  });

  it('falls back to the kind when the payload carries no title', () => {
    const artifact = messageBlockArtifact(
      block({ blockType: 'table', payload: { columns: [], rows: [] } }),
      t,
    );
    expect(artifact?.title).toBe('Table');
    expect(artifact?.meta).toBe('Table · 0 rows');
  });

  it('refuses prose, which has no pane to open', () => {
    expect(messageBlockArtifact(block({ blockType: 'markdown' }), t)).toBeNull();
  });

  it('builds a document stage artifact from a document block', () => {
    const documentBlock = block({
      blockType: 'document' as MessageBlock['blockType'],
      payload: { document_id: 'doc-1', filename: 'daily-report.md' },
    });

    expect(messageBlockArtifact(documentBlock, t)).toEqual({
      id: 'block:b1',
      kind: 'table',
      title: 'daily-report.md',
      meta: 'Document',
    });
  });

  it('keeps the id stable across locales, because the stage keys on it', () => {
    const chart = block({ blockType: 'chart', payload: chartPayload });
    expect(messageBlockArtifact(chart, createTranslator('vi'))?.id).toBe(
      messageBlockArtifact(chart, t)?.id,
    );
  });
});

describe('tableFromChartPreview', () => {
  it('turns a chart preview into rows keyed by column name', () => {
    const content = tableFromChartPreview(parseChatChartPreview(chartPayload));
    expect(content.columns).toEqual([
      { key: 'day', label: 'day', numeric: false },
      { key: 'units', label: 'units', numeric: true },
    ]);
    expect(content.rows).toEqual([
      { day: 'Mon', units: 410 },
      { day: 'Tue', units: 520 },
    ]);
  });
});
