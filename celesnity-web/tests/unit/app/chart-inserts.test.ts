// @vitest-environment jsdom

import { createElement, createRef } from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { chartSlots } from '@/app/_components/chat/chart-card-skeleton';
import { ChatMarkdown } from '@/app/_components/chat/chat-markdown';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import { hydrateChatRunHistory } from '@/app/_components/chat/chat-run-history';
import { REVEAL_TICK_MS } from '@/app/_components/chat/stream-reveal';
import { textAnchorOf, textAnchorPosition } from '@/app/_components/chat/text-anchor';
import type { DisplayMessage, MessageBlock, ToolActivity } from '@/app/_components/chat/types';
import { renderUi as render } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const intro = 'I will list the tables and then chart the revenue.';
const outro = 'Revenue peaks in December.';
const content = `${intro}\n\n${outro}`;

const previewCall: ToolActivity = {
  id: 'call-1',
  name: 'mcp__chart__preview_chart',
  status: 'done',
  textOffset: intro.length,
  textAnchor: textAnchorOf(intro),
};

const chartBlock: MessageBlock = {
  id: 'block-1',
  runId: 'run-1',
  blockType: 'chart',
  payload: {},
  fallbackText: 'Revenue by month',
};

/* Order of the rendered children of the markdown root, as short labels. */
function order(root: Element): readonly string[] {
  return [...root.children].map((child) =>
    child.getAttribute('data-slot') === 'chat-markdown-insert'
      ? `insert:${child.textContent?.trim()}`
      : (child.textContent?.trim() ?? ''),
  );
}

describe('text anchors', () => {
  it('keeps the tail of the reply and finds it again in the rendered prose', () => {
    const anchor = textAnchorOf(intro);
    expect(anchor.length).toBeLessThanOrEqual(48);
    expect(intro.endsWith(anchor)).toBe(true);
    expect(textAnchorPosition(content, anchor)).toBe(intro.length);
    expect(textAnchorPosition('', anchor)).toBe(-1);
    expect(textAnchorPosition(content, '')).toBe(0);
  });

  it('picks the occurrence nearest the recorded offset when a sentence repeats', () => {
    const twice = 'Retrying.\n\nRetrying.\n\nDone.';
    expect(textAnchorPosition(twice, 'Retrying.', 20)).toBe(20);
    expect(textAnchorPosition(twice, 'Retrying.', 5)).toBe(9);
  });
});

describe('chartSlots', () => {
  it('zips the surviving preview calls with the chart blocks, in order', () => {
    const failed: ToolActivity = { ...previewCall, id: 'call-0', status: 'failed', textOffset: 3 };
    const slots = chartSlots([failed, previewCall], [chartBlock], true);
    expect(slots).toEqual([
      {
        key: 'block:block-1',
        block: chartBlock,
        anchor: previewCall.textAnchor,
        offset: intro.length,
      },
    ]);
  });

  it('owes a placeholder slot for a call whose block has not landed, only while live', () => {
    expect(chartSlots([previewCall], [], true)).toEqual([
      { key: 'pending-chart:0', anchor: previewCall.textAnchor, offset: intro.length },
    ]);
    expect(chartSlots([previewCall], [], false)).toEqual([]);
  });

  it('carries a block with no call to pin it to without an anchor', () => {
    expect(chartSlots([], [chartBlock], false)).toEqual([
      { key: 'block:block-1', block: chartBlock },
    ]);
  });
});

/*
 * A chart used to sit above every sentence of the answer, so it jumped to
 * the top the moment it arrived. It now lands just after the sentence that
 * announced it; a chart with no pin trails the prose; one pinned before any
 * prose leads it.
 */
describe('ChatMarkdown inserts', () => {
  it('places an insert after the block that ends with its anchor', () => {
    const { container } = render(
      createElement(ChatMarkdown, {
        content,
        inserts: [
          {
            key: 'chart',
            anchor: textAnchorOf(intro),
            offset: intro.length,
            node: createElement('div', null, 'CHART'),
          },
        ],
      }),
    );

    expect(order(container.querySelector('[data-slot="chat-markdown"]')!)).toEqual([
      intro,
      'insert:CHART',
      outro,
    ]);
  });

  it('trails the prose without an anchor and leads it with an empty one', () => {
    const { container } = render(
      createElement(ChatMarkdown, {
        content,
        inserts: [
          { key: 'late', node: createElement('div', null, 'LATE') },
          { key: 'early', anchor: '', offset: 0, node: createElement('div', null, 'EARLY') },
        ],
      }),
    );

    expect(order(container.querySelector('[data-slot="chat-markdown"]')!)).toEqual([
      'insert:EARLY',
      intro,
      outro,
      'insert:LATE',
    ]);
  });

  it('holds an insert whose anchor has not streamed in after what is shown', () => {
    const { container } = render(
      createElement(ChatMarkdown, {
        content: intro.slice(0, 10),
        inserts: [
          {
            key: 'chart',
            anchor: textAnchorOf(intro),
            offset: intro.length,
            node: createElement('div', null, 'CHART'),
          },
        ],
      }),
    );

    expect(order(container.querySelector('[data-slot="chat-markdown"]')!)).toEqual([
      intro.slice(0, 10),
      'insert:CHART',
    ]);
  });
});

describe('a restored run pins its tool calls', () => {
  it('records the prose streamed before each call from the run events', () => {
    const [assistant] = hydrateChatRunHistory(
      [{ id: 'a1', role: 'assistant', content: '', timestamp: '2026-09-28T10:00:00.000Z' }],
      [
        {
          runId: 'run-1',
          sessionId: 'session-1',
          input: 'Chart revenue',
          status: 'completed',
          createdAt: '2026-09-28T10:00:00.000Z',
          finishedAt: '2026-09-28T10:00:20.000Z',
          responseText: content,
          events: [
            { seq: 1, payload: { type: 'text', data: intro } },
            {
              seq: 2,
              payload: {
                type: 'tool_started',
                data: { id: 'call-1', name: 'mcp__chart__preview_chart', arguments: {} },
              },
            },
            { seq: 3, payload: { type: 'tool_finished', data: { id: 'call-1', success: true } } },
            { seq: 4, payload: { type: 'text', data: `\n\n${outro}` } },
          ],
        },
      ],
    );

    expect(assistant?.toolActivity).toEqual([
      {
        id: 'call-1',
        name: 'mcp__chart__preview_chart',
        status: 'done',
        arguments: {},
        textOffset: intro.length,
        textAnchor: textAnchorOf(intro),
      },
    ]);
  });
});

describe('ChatMessageList chart placement', () => {
  function props(message: DisplayMessage, isStreaming: boolean) {
    return {
      messages: [
        {
          id: 'u1',
          role: 'user' as const,
          content: 'Chart revenue',
          timestamp: '2026-09-28T10:00:00.000Z',
        },
        message,
      ],
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

  it('draws the chart between the sentence that announced it and the answer', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        props(
          {
            id: 'a1',
            role: 'assistant',
            content,
            timestamp: '2026-09-28T10:00:01.000Z',
            runId: 'run-1',
            toolActivity: [previewCall],
            messageBlocks: [chartBlock],
          },
          false,
        ),
      ),
    );

    const root = container.querySelector('[data-slot="chat-markdown"]')!;
    expect(order(root)).toEqual([intro, 'insert:Revenue by month', outro]);
    // Nothing is left in the block column above the prose.
    expect(screen.getAllByText('Revenue by month')).toHaveLength(1);
  });

  it('holds the placeholder at that spot while the preview still runs', () => {
    // A live reply reveals its words a few per frame; run the frames so the
    // announcing sentence is on screen, the way it is when a tool starts.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { container } = render(
      createElement(
        ChatMessageList,
        props(
          {
            id: 'a1',
            role: 'assistant',
            content: intro,
            timestamp: '2026-09-28T10:00:01.000Z',
            runId: 'run-1',
            toolActivity: [{ ...previewCall, status: 'running' }],
          },
          true,
        ),
      ),
    );
    for (let frame = 0; frame < 80; frame += 1) act(() => vi.advanceTimersByTime(REVEAL_TICK_MS));

    const root = container.querySelector('[data-slot="chat-markdown"]')!;
    const labels = order(root);
    expect(labels[0]).toBe(intro);
    expect(labels[1]).toMatch(/^insert:/u);
    expect(screen.getByRole('status', { name: 'Drawing the chart…' })).toBeTruthy();
  });
});
