// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InlineMessageBlock } from '@/app/_components/chat/inline-message-block';
import type { MessageBlock } from '@/app/_components/chat/types';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

const payload = {
  kind: 'preview',
  schema_version: 1,
  title: 'Revenue by region',
  description: 'Sample data',
  query_definition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  },
  visualization_definition: {
    schemaVersion: 1,
    type: 'TABLE',
    roles: { columns: ['region', 'revenue'] },
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

const block: MessageBlock = {
  id: 'chart-1',
  runId: 'run-1',
  blockType: 'chart',
  payload,
  fallbackText: 'Revenue by region (chart)',
};

const renderer: ChartRenderer = { compile: () => null };

function drawingProps() {
  return { block, renderer };
}

/*
 * A chart used to render as a one-line card that opened a pane, so the
 * answer "revenue peaks in December" showed a row reading "Revenue · Chart"
 * and the line itself was one click and a column away. The chart now draws
 * under the sentence, and the stage is where it goes when asked.
 */
describe('InlineMessageBlock chart blocks', () => {
  it('draws the chart in the transcript with a button that opens it on the stage', () => {
    const onOpenArtifact = vi.fn();
    renderUi(
      createElement(InlineMessageBlock, {
        ...drawingProps(),
        onOpenArtifact,
        artifactOpen: false,
      }),
    );

    const card = document.querySelector('[data-slot="chat-chart-card"]');
    expect(card).not.toBeNull();
    /* Named by its block, so a tab on the stage can scroll the transcript here. */
    expect(card?.getAttribute('data-block-id')).toBe('chart-1');
    expect(screen.getByText('Revenue by region')).toBeTruthy();
    expect(screen.getByText('Sample data')).toBeTruthy();
    expect(card?.className).not.toContain('border-primary/40');

    fireEvent.click(screen.getByRole('button', { name: 'Open in the side panel' }));
    expect(onOpenArtifact).toHaveBeenCalledWith(block);
    /* Keeping happens on the stage, so the card carries no Save control. */
    expect(screen.queryByRole('button', { name: 'Save chart' })).toBeNull();
  });

  it('tints the card while its pane is open', () => {
    renderUi(
      createElement(InlineMessageBlock, {
        ...drawingProps(),
        onOpenArtifact: vi.fn(),
        artifactOpen: true,
      }),
    );

    expect(document.querySelector('[data-slot="chat-chart-card"]')?.className).toContain(
      'border-primary/40',
    );
  });

  it('offers no stage button on a surface without a stage', () => {
    renderUi(createElement(InlineMessageBlock, drawingProps()));

    expect(document.querySelector('[data-slot="chat-chart-card"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Open in the side panel' })).toBeNull();
  });

  it('says so when the query came back empty, instead of drawing nothing', () => {
    renderUi(
      createElement(InlineMessageBlock, {
        ...drawingProps(),
        block: { ...block, payload: { ...payload, rows: [], row_count: 0 } },
        onOpenArtifact: vi.fn(),
      }),
    );

    expect(screen.getByRole('status').textContent).toContain('no rows');
    expect(screen.queryByRole('group', { name: 'Chart or table' })).toBeNull();
  });

  it('falls back to the one-line card when there is nothing to draw with', () => {
    renderUi(createElement(InlineMessageBlock, { block, onOpenArtifact: vi.fn() }));

    expect(document.querySelector('[data-slot="chat-chart-card"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Revenue by region/u })).toBeTruthy();
  });
});
