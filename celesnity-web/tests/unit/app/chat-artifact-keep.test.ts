// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { BlockPane } from '@/app/(workspace)/chat/_components/stage/block-pane';
import type { MessageBlock } from '@/app/_components/chat/types';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';

afterEach(cleanup);

const noChart: ChartRenderer = { compile: vi.fn().mockReturnValue(null) };

const personal: ChartCollection = {
  id: 'col-personal',
  organizationId: 'org',
  parentId: null,
  name: 'Your personal collection',
  description: null,
  kind: 'PERSONAL',
  access: 'CURATE',
  chartCount: 0,
  archivedAt: null,
  children: [],
};

function chartBlock(overrides: Record<string, unknown> = {}): MessageBlock {
  return {
    id: 'b1',
    runId: 'run-1',
    blockType: 'chart',
    fallbackText: 'Avg temperature by machine',
    payload: {
      kind: 'preview',
      schema_version: 1,
      title: 'Avg temperature by machine',
      description: null,
      query_definition: {
        schemaVersion: 1,
        mode: 'NATIVE',
        context: { catalog: 'iceberg', schema: 'factory_silver' },
        parameters: [],
        sql: 'select machine, avg(temp) from press_telemetry group by 1',
      },
      visualization_definition: { schemaVersion: 1, type: 'BAR', roles: {}, display: {} },
      output_schema: [
        { name: 'machine', type: 'varchar', family: 'STRING' },
        { name: 'temp', type: 'double', family: 'NUMBER' },
      ],
      parameter_values: {},
      rows: [
        ['PRESS-A01', 61.5],
        ['PRESS-A05', 65.5],
      ],
      run_id: 'run-9',
      row_count: 2,
      byte_count: 64,
      truncated: false,
      display_truncated: false,
      ...overrides,
    },
  };
}

function paneProps(overrides: Record<string, unknown> = {}) {
  return {
    block: chartBlock(),
    renderer: noChart,
    question: 'which machine ran hottest?',
    onKept: vi.fn(),
    listCollections: vi.fn().mockResolvedValue([personal]),
    saveChatPreview: vi.fn().mockResolvedValue({ id: 'chart-77', title: 'Avg temperature' }),
    ...overrides,
  };
}

describe('keeping a chart from the chat stage', () => {
  it('keeps it in the personal collection without asking where', async () => {
    const saveChatPreview = vi.fn().mockResolvedValue({ id: 'chart-77' });
    const onKept = vi.fn();
    render(createElement(BlockPane, paneProps({ saveChatPreview, onKept })));

    fireEvent.click(await screen.findByRole('button', { name: 'Keep' }));

    await waitFor(() => expect(saveChatPreview).toHaveBeenCalledOnce());
    expect(saveChatPreview.mock.calls[0]?.[0]).toMatchObject({
      title: 'Avg temperature by machine',
      collectionId: 'col-personal',
      truncated: false,
    });
    /* No dialog stood between the press and the save. */
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(onKept).toHaveBeenCalledWith({
        chartId: 'chart-77',
        collectionName: 'Your personal collection',
      }),
    );
  });

  it('writes the question onto a chart the agent left undescribed', async () => {
    const saveChatPreview = vi.fn().mockResolvedValue({ id: 'chart-77' });
    render(createElement(BlockPane, paneProps({ saveChatPreview })));

    fireEvent.click(await screen.findByRole('button', { name: 'Keep' }));

    await waitFor(() =>
      expect(saveChatPreview.mock.calls[0]?.[0]).toMatchObject({
        description: 'which machine ran hottest?',
      }),
    );
  });

  it("leaves the agent's own description alone", async () => {
    const saveChatPreview = vi.fn().mockResolvedValue({ id: 'chart-77' });
    render(
      createElement(
        BlockPane,
        paneProps({
          block: chartBlock({ description: 'Seven days of press output.' }),
          saveChatPreview,
        }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Keep' }));

    await waitFor(() =>
      expect(saveChatPreview.mock.calls[0]?.[0]).toMatchObject({
        description: 'Seven days of press output.',
      }),
    );
  });

  it('says where it went, in place of the action', async () => {
    render(
      createElement(
        BlockPane,
        paneProps({ kept: { chartId: 'chart-77', collectionName: 'Your personal collection' } }),
      ),
    );

    expect(screen.getByText('Kept in')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Your personal collection/u });
    expect(link.getAttribute('href')).toBe('/analytics/charts/chart-77');
    /* The state replaced the action; it did not sit beside it. */
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('refuses a capped preview, and says why on the control', async () => {
    render(createElement(BlockPane, paneProps({ block: chartBlock({ truncated: true }) })));

    const control = await screen.findByRole('button', { name: /Too large to keep/u });
    expect(control).toHaveProperty('disabled', true);
    expect(control.getAttribute('title')).toContain('analytical limit');
  });

  it('keeps the press available after a failure, and names it', async () => {
    const saveChatPreview = vi.fn().mockRejectedValue(new Error('Collection is read-only.'));
    render(createElement(BlockPane, paneProps({ saveChatPreview })));

    fireEvent.click(await screen.findByRole('button', { name: 'Keep' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Collection is read-only.',
    );
    expect(screen.getByRole('button', { name: 'Keep' })).toHaveProperty('disabled', false);
  });

  it('offers nothing to keep when the surface cannot save', () => {
    render(createElement(BlockPane, { block: chartBlock(), renderer: noChart, question: null }));
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('offers nothing on a table, which has no query to save', () => {
    render(
      createElement(
        BlockPane,
        paneProps({
          block: {
            id: 'b2',
            runId: 'run-1',
            blockType: 'table',
            fallbackText: 'rows',
            payload: {
              title: 'Late orders',
              columns: [{ key: 'a', label: 'A' }],
              rows: [{ a: 1 }],
            },
          },
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });
});
