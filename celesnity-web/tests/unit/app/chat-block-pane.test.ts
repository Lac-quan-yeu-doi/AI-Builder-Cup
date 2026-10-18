// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { BlockPane } from '@/app/(workspace)/chat/_components/stage/block-pane';
import type { MessageBlock } from '@/app/_components/chat/types';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

afterEach(cleanup);

function block(overrides: Partial<MessageBlock> & Pick<MessageBlock, 'blockType'>): MessageBlock {
  return { id: 'b1', runId: 'run-1', payload: {}, fallbackText: 'fallback', ...overrides };
}

const tablePayload = {
  title: 'Late orders',
  columns: [
    { key: 'order', label: 'Order' },
    { key: 'line', label: 'Line' },
    { key: 'units', label: 'Units' },
  ],
  rows: [
    { order: 'SO-10422', line: 'Line 2', units: 1840 },
    { order: 'SO-10431', line: 'Line 2', units: 1220 },
    { order: 'SO-10440', line: 'Line 1', units: 960 },
  ],
};

const chartPayload = {
  kind: 'preview',
  schema_version: 1,
  title: 'Output per line',
  description: null,
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
  row_count: 4812,
  byte_count: 64,
  truncated: true,
  display_truncated: false,
};

/* A renderer that compiles nothing, so the pane falls back to the rows. The
   drawing itself belongs to `ChartView`'s own tests. */
const noChart: ChartRenderer = { compile: vi.fn().mockReturnValue(null) };

describe('BlockPane, table', () => {
  it('reads the rows in a sentence, then shows them', () => {
    render(
      createElement(BlockPane, { block: block({ blockType: 'table', payload: tablePayload }) }),
    );

    expect(screen.getByText('Line 2 holds 2 of 3 rows by line.')).toBeTruthy();
    expect(screen.getByText('SO-10422')).toBeTruthy();
  });

  it('pins a source bar naming what it is made of', () => {
    render(
      createElement(BlockPane, { block: block({ blockType: 'table', payload: tablePayload }) }),
    );

    expect(screen.getByText('Late orders')).toBeTruthy();
    expect(screen.getByText('3 rows')).toBeTruthy();
    /* A table block carries no query, so there is nothing to unfold. */
    expect(screen.queryByRole('button', { name: 'Show query' })).toBeNull();
  });

  it('sorts on a column header without changing the artifact', () => {
    render(
      createElement(BlockPane, { block: block({ blockType: 'table', payload: tablePayload }) }),
    );

    const header = screen.getByRole('button', { name: /Units/u });
    fireEvent.click(header);

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells.slice(0, 3)).toEqual(['SO-10440', 'Line 1', '960']);
  });

  it('says so when a query came back with nothing', () => {
    render(
      createElement(BlockPane, {
        block: block({
          blockType: 'table',
          payload: { title: 'Late orders', columns: [], rows: [] },
        }),
      }),
    );
    expect(screen.getByText('This query came back with no rows.')).toBeTruthy();
  });
});

describe('BlockPane, chart', () => {
  it('names the database and folds the query behind one click', () => {
    render(
      createElement(BlockPane, {
        block: block({ blockType: 'chart', payload: chartPayload }),
        renderer: noChart,
      }),
    );

    expect(screen.getByText('iceberg.factory')).toBeTruthy();
    /* The run reported 4,812 rows and sent 2, and the bar says both. */
    expect(screen.getByText('2 of 4,812 rows')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show query' }));
    expect(screen.getByText('select day, units from output')).toBeTruthy();
  });

  it('draws the rows when the visualization compiles to no chart', () => {
    render(
      createElement(BlockPane, {
        block: block({ blockType: 'chart', payload: chartPayload }),
        renderer: noChart,
      }),
    );
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('410')).toBeTruthy();
  });

  it('falls back to the block text when the payload is not a preview', () => {
    render(
      createElement(BlockPane, {
        block: block({ blockType: 'chart', payload: { kind: 'something-else' } }),
        renderer: noChart,
      }),
    );
    expect(screen.getByText('fallback')).toBeTruthy();
  });
});

describe('BlockPane, document', () => {
  it('keeps old document blocks readable as fallback text', () => {
    render(
      createElement(BlockPane, {
        block: block({
          blockType: 'document' as MessageBlock['blockType'],
          payload: { document_id: 'doc-1' },
        }),
      }),
    );
    expect(screen.getByText('fallback')).toBeTruthy();
  });
});
