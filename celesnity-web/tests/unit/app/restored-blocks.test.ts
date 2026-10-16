// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { mergeRestoredBlocks, splitRestoredBlocks } from '@/app/_components/chat/restored-blocks';
import { RestoredArtifacts } from '@/app/_components/chat/restored-artifacts';
import type { MessageBlock } from '@/app/_components/chat/types';

function block(overrides: Partial<MessageBlock> = {}): MessageBlock {
  return {
    id: 'block-1',
    runId: 'run-1',
    blockType: 'chart',
    payload: { title: 'Throughput by line' },
    fallbackText: '',
    publishedAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

afterEach(cleanup);

describe('placing blocks restored from history', () => {
  it('attaches a block whose run is still on screen', () => {
    const { attach, restored } = splitRestoredBlocks([{ runId: 'run-1' }], [block()]);

    expect(attach.map((item) => item.id)).toEqual(['block-1']);
    expect(restored).toEqual([]);
  });

  it('keeps an artifact whose run nothing on screen claims', () => {
    // The state after a reload: the transcript restores as text with no run
    // ids, so every block the conversation produced is an orphan.
    const { attach, restored } = splitRestoredBlocks([{}, {}], [block()]);

    expect(attach).toEqual([]);
    expect(restored.map((item) => item.id)).toEqual(['block-1']);
  });

  it('leaves prose out of the index', () => {
    const { restored } = splitRestoredBlocks(
      [],
      [block({ id: 'prose', blockType: 'markdown' }), block({ id: 'chart' })],
    );

    expect(restored.map((item) => item.id)).toEqual(['chart']);
  });

  it('orders by the only timestamp the UI has', () => {
    const { restored } = splitRestoredBlocks(
      [],
      [
        block({ id: 'late', publishedAt: '2026-09-15T12:00:00.000Z' }),
        block({ id: 'early', publishedAt: '2026-09-15T09:00:00.000Z' }),
      ],
    );

    expect(restored.map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('merges a later backfill without duplicating what it already holds', () => {
    const held = [block({ id: 'a', publishedAt: '2026-09-15T09:00:00.000Z' })];
    const merged = mergeRestoredBlocks(held, [
      block({ id: 'a', publishedAt: '2026-09-15T09:00:00.000Z' }),
      block({ id: 'b', publishedAt: '2026-09-15T11:00:00.000Z' }),
    ]);

    expect(merged.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('the restored artifact index', () => {
  it('renders nothing when the conversation produced none', () => {
    const { container } = renderUi(
      createElement(RestoredArtifacts, { blocks: [], onOpen: vi.fn() }),
    );

    expect(container.textContent).toBe('');
  });

  it('counts what came back and opens a pane from the card', () => {
    const onOpen = vi.fn();
    // A table block, because a chart's title is read off a validated preview
    // payload and a fixture shaped like one belongs in the chart tests.
    const table = (id: string, title: string): MessageBlock =>
      block({
        id,
        blockType: 'table',
        payload: { title, columns: [{ key: 'line', label: 'Line' }], rows: [{ line: 'A' }] },
      });

    renderUi(
      createElement(RestoredArtifacts, {
        blocks: [table('block-1', 'Throughput by line'), table('block-2', 'Scrap rate')],
        onOpen,
      }),
    );

    expect(screen.getByText('2 from earlier in this conversation')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Throughput by line/ }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'block-1' }));
  });
});
