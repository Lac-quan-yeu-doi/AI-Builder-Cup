// @vitest-environment jsdom

import { createElement, createRef } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import { pendingChartCount } from '@/app/_components/chat/chart-card-skeleton';
import type { DisplayMessage, MessageBlock, ToolActivity } from '@/app/_components/chat/types';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(cleanup);

const question: DisplayMessage = {
  id: 'u1',
  role: 'user',
  content: 'Revenue by month?',
  timestamp: '2026-09-27T08:00:00.000Z',
};

const preview: ToolActivity = {
  id: 'call-1',
  name: 'mcp__chart__preview_chart',
  status: 'running',
  arguments: { title: 'Revenue by month' },
};

const chartBlock: MessageBlock = {
  id: 'block-1',
  runId: 'run-1',
  blockType: 'chart',
  payload: {},
  fallbackText: 'Revenue by month',
};

function reply(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: 'I will chart revenue by month.',
    timestamp: '2026-09-27T08:00:01.000Z',
    runId: 'run-1',
    toolActivity: [preview],
    ...overrides,
  };
}

function props(messages: readonly DisplayMessage[], isStreaming: boolean) {
  return {
    messages,
    isStreaming,
    messageRowRefs: { current: new Map<string, HTMLDivElement>() },
    messagesEndRef: createRef<HTMLDivElement>(),
    resolveCitations: vi.fn().mockResolvedValue([]),
    onCitationsResolved: vi.fn(),
    onCitationClick: vi.fn(),
    onSuggestionSelect: vi.fn(),
    onInspectRun: vi.fn(),
    listPendingActions: vi.fn().mockResolvedValue([]),
    approvePendingAction: vi.fn(),
    rejectPendingAction: vi.fn(),
  };
}

const placeholder = () => screen.queryByRole('status', { name: 'Drawing the chart…' });

describe('pendingChartCount', () => {
  it('owes one card per preview the agent asked for, less the charts that landed', () => {
    expect(pendingChartCount([preview], [])).toBe(1);
    // The block travels on its own channel after the tool returns.
    expect(pendingChartCount([{ ...preview, status: 'done' }], [])).toBe(1);
    expect(pendingChartCount([{ ...preview, status: 'done' }], [chartBlock])).toBe(0);
    expect(pendingChartCount([{ ...preview, status: 'failed' }], [])).toBe(0);
    expect(
      pendingChartCount([{ id: 'q', name: 'mcp__trino__run_query', status: 'running' }], []),
    ).toBe(0);
  });
});

/*
 * The agent's opening sentence used to sit alone while the query ran, and
 * the chart then pushed everything under it down by its own height. A
 * placeholder of the card's size now holds the spot from the moment the
 * preview is asked for until its block lands.
 */
describe('ChatMessageList chart placeholder', () => {
  it("holds the chart's place while the preview runs and yields it to the card", () => {
    const { rerender } = render(createElement(ChatMessageList, props([question, reply()], true)));
    expect(placeholder()).toBeTruthy();

    rerender(
      createElement(
        ChatMessageList,
        props(
          [
            question,
            reply({ toolActivity: [{ ...preview, status: 'done' }], messageBlocks: [chartBlock] }),
          ],
          true,
        ),
      ),
    );
    expect(placeholder()).toBeNull();
    expect(screen.getByText('Revenue by month')).toBeTruthy();
  });

  it('holds the place before the reply has said anything', () => {
    render(createElement(ChatMessageList, props([question, reply({ content: '' })], true)));
    expect(placeholder()).toBeTruthy();
  });

  it('shows no placeholder once the turn is over or when the preview failed', () => {
    const { rerender } = render(createElement(ChatMessageList, props([question, reply()], false)));
    expect(placeholder()).toBeNull();

    rerender(
      createElement(
        ChatMessageList,
        props([question, reply({ toolActivity: [{ ...preview, status: 'failed' }] })], true),
      ),
    );
    expect(placeholder()).toBeNull();
  });
});
