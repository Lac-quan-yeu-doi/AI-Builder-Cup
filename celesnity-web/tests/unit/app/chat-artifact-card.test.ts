// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import type { DisplayMessage, MessageBlock } from '@/app/_components/chat/types';

afterEach(cleanup);

const tableBlock: MessageBlock = {
  id: 'blk-1',
  runId: 'run-1',
  blockType: 'table',
  fallbackText: 'A table of late orders',
  payload: {
    title: 'Late orders',
    columns: [
      { key: 'order', label: 'Order' },
      { key: 'line', label: 'Line' },
      { key: 'units', label: 'Units' },
    ],
    rows: [
      { order: 'SO-10422', line: 'Line 2', units: 1840 },
      { order: 'SO-10431', line: 'Line 2', units: 1220 },
    ],
  },
};

const proseBlock: MessageBlock = {
  id: 'blk-2',
  runId: 'run-1',
  blockType: 'markdown',
  fallbackText: '',
  payload: { content: 'Two orders are past due.' },
};

const documentBlock: MessageBlock = {
  id: 'doc-block-1',
  runId: 'run-1',
  blockType: 'document',
  fallbackText: 'daily-report.md document',
  payload: {
    document_id: 'doc-1',
    filename: 'daily-report.md',
    mime_type: 'text/markdown',
  },
};

const message: DisplayMessage = {
  id: 'm1',
  role: 'assistant',
  content: '',
  timestamp: '2026-09-15T08:00:00.000Z',
  messageBlocks: [tableBlock, proseBlock],
};

function props(overrides: Partial<Parameters<typeof ChatMessageList>[0]> = {}) {
  return {
    messages: [message],
    isStreaming: false,
    messageRowRefs: { current: new Map<string, HTMLDivElement>() },
    resolveCitations: vi.fn().mockResolvedValue([]),
    onCitationsResolved: vi.fn(),
    onCitationClick: vi.fn(),
    onSuggestionSelect: vi.fn(),
    onInspectRun: vi.fn(),
    listPendingActions: vi.fn().mockResolvedValue([]),
    approvePendingAction: vi.fn(),
    rejectPendingAction: vi.fn(),
    ...overrides,
  };
}

describe('artifact cards in the transcript', () => {
  /*
   * The container has to have a door. A previous refactor moved everything
   * into a container and shipped it without checking anything could get in,
   * so the card being clickable is the assertion that matters most here.
   */
  it('opens the block it names when the card is clicked', () => {
    const onOpenArtifact = vi.fn();
    render(createElement(ChatMessageList, props({ onOpenArtifact })));

    fireEvent.click(screen.getByText('Late orders'));

    expect(onOpenArtifact).toHaveBeenCalledOnce();
    expect(onOpenArtifact.mock.calls[0]?.[0]).toBe(tableBlock);
  });

  it('shows a created document and opens it from the transcript', () => {
    const onOpenArtifact = vi.fn();
    render(
      createElement(
        ChatMessageList,
        props({
          messages: [{ ...message, messageBlocks: [documentBlock] }],
          onOpenArtifact,
        }),
      ),
    );

    expect(screen.getByText('daily-report.md')).toBeTruthy();
    expect(screen.getByText('Document')).toBeTruthy();
    fireEvent.click(screen.getByText('daily-report.md'));

    expect(onOpenArtifact).toHaveBeenCalledWith(documentBlock);
  });

  it('splits to the right from the card', () => {
    const onOpenArtifact = vi.fn();
    render(createElement(ChatMessageList, props({ onOpenArtifact })));

    fireEvent.click(screen.getByRole('button', { name: 'Open to the right' }));

    expect(onOpenArtifact).toHaveBeenCalledWith(tableBlock, 'right');
  });

  /*
   * The design system's card is one row at the height of one line of text:
   * icon, title, and the kind as a quiet suffix. The row count lives on the
   * pane's source bar, where the data is.
   */
  it('names the kind as a one-word suffix, on one line', () => {
    const { container } = render(
      createElement(ChatMessageList, props({ onOpenArtifact: vi.fn() })),
    );

    expect(screen.getByText('Late orders')).toBeTruthy();
    expect(screen.getByText('Table')).toBeTruthy();
    expect(screen.queryByText('Table · 2 rows')).toBeNull();
    expect(container.querySelector('.group\\/artifact')?.className).toContain('h-9');
  });

  /*
   * The card's own border and tint carry the state, per the design system. A
   * word repeated on every open card is a word nobody reads twice, and the one
   * it used to print — "Open on the stage" — read as an instruction rather
   * than as where the thing already is.
   */
  it('shows an open artifact in its border rather than in a second line of text', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        props({ onOpenArtifact: vi.fn(), openArtifactIds: new Set(['block:blk-1']) }),
      ),
    );

    const card = container.querySelector('.group\\/artifact');
    expect(card?.className).toContain('border-primary/40');
    expect(screen.queryByText('On stage')).toBeNull();
    expect(screen.getByText('Table')).toBeTruthy();
  });

  it('leaves prose alone, because a paragraph is not an artifact', () => {
    render(createElement(ChatMessageList, props({ onOpenArtifact: vi.fn() })));
    expect(screen.getByText('Two orders are past due.')).toBeTruthy();
    /* The table became a card, so its cells are not in the transcript. */
    expect(screen.queryByText('SO-10422')).toBeNull();
  });

  it('still renders the table inline where there is no stage to open', () => {
    /* A chat panel beside a workflow passes no callback, and has to keep
       working rather than lose the block entirely. */
    render(createElement(ChatMessageList, props()));
    expect(screen.getByText('SO-10422')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open to the right' })).toBeNull();
  });
});
