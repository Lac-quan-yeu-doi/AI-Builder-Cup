// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { ChatMessageList } from '@/app/_components/chat/chat-message-list';
import type { DisplayMessage } from '@/app/_components/chat/types';

afterEach(cleanup);

const userMessage: DisplayMessage = {
  id: 'm1',
  role: 'user',
  content: 'How did production go this week?',
  timestamp: '2026-09-05T08:00:00.000Z',
};
const assistantMessage: DisplayMessage = {
  id: 'm2',
  role: 'assistant',
  content: 'Output was up 4% week over week.',
  timestamp: '2026-09-05T08:00:05.000Z',
};

function baseProps(overrides: Partial<Parameters<typeof ChatMessageList>[0]> = {}) {
  return {
    messages: [userMessage, assistantMessage],
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

describe('ChatMessageList', () => {
  it('renders a user turn and an assistant turn', () => {
    render(createElement(ChatMessageList, baseProps()));
    expect(screen.getByText('How did production go this week?')).toBeTruthy();
    expect(screen.getByText('Output was up 4% week over week.')).toBeTruthy();
  });

  it('registers each rendered row into messageRowRefs, keyed by message id', () => {
    const messageRowRefs = { current: new Map<string, HTMLDivElement>() };
    render(createElement(ChatMessageList, baseProps({ messageRowRefs })));
    expect(messageRowRefs.current.has('m1')).toBe(true);
    expect(messageRowRefs.current.has('m2')).toBe(true);
  });

  /* The scroller brings an anchored item to the top once and then leaves the
     view alone while the answer streams in under it. Only the newest question
     is the anchor: not the answer, or the view would jump to it, and not an
     earlier question, or a reopened conversation could jump back to it. */
  it('anchors only the newest question, and glides there', () => {
    const { container, rerender } = render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            userMessage,
            assistantMessage,
            { ...userMessage, id: 'm3', content: 'And last week?' },
            { ...assistantMessage, id: 'm4', content: 'Flat.' },
          ],
        }),
      ),
    );
    const items = [...container.querySelectorAll('[data-slot="message-scroller-item"]')].map(
      (item) => [item.getAttribute('data-message-id'), item.getAttribute('data-scroll-anchor')],
    );
    expect(items).toEqual([
      ['m1', 'false'],
      [null, 'false'],
      ['m3', 'true'],
      [null, 'false'],
    ]);
    // The glide is for the move to a fresh question; a reopened conversation
    // must land on its end at once.
    const viewport = () =>
      container.querySelector('[data-slot="message-scroller-viewport"]')?.className ?? '';
    expect(viewport()).not.toContain('scroll-smooth');
    rerender(createElement(ChatMessageList, baseProps({ isStreaming: true })));
    expect(viewport()).toContain('motion-safe:scroll-smooth');
  });

  it('shows the thinking indicator while the last assistant turn is streaming with no content yet', () => {
    const pendingAssistant: DisplayMessage = { ...assistantMessage, content: '' };
    render(
      createElement(
        ChatMessageList,
        baseProps({ messages: [userMessage, pendingAssistant], isStreaming: true }),
      ),
    );
    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(screen.queryByText('Output was up 4% week over week.')).toBeNull();
  });

  /* The reply opens with a sentence, then the tools run. Alone, that sentence
     looks like the whole answer. */
  it('keeps the thinking card under the text while the run is still streaming', () => {
    const streaming: DisplayMessage = {
      ...assistantMessage,
      content: "I'll look up this week's output.",
      toolActivity: [
        { id: 'a', name: 'mcp__trino__list_tables', status: 'done' },
        {
          id: 'b',
          name: 'mcp__trino__run_query',
          status: 'running',
          arguments: { sql: 'SELECT 1' },
        },
      ],
    };
    // Streaming prose is let out a word per animation frame.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { container, rerender } = render(
      createElement(
        ChatMessageList,
        baseProps({ messages: [userMessage, streaming], isStreaming: true }),
      ),
    );
    // Past the hold on a half-written last word, too.
    for (let tick = 0; tick < 12; tick += 1) act(() => vi.advanceTimersByTime(32));
    vi.useRealTimers();
    // One span per word while it streams, so match the paragraph as a whole.
    expect(container.querySelector('[data-assistant-turn] p')?.textContent).toBe(
      "I'll look up this week's output.",
    );
    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(screen.getByText('Running SQL query: SELECT 1')).toBeTruthy();
    // The reasoning toggle already counts the finished steps.
    expect(screen.queryByTitle('mcp__trino__list_tables')).toBeNull();

    rerender(
      createElement(
        ChatMessageList,
        baseProps({ messages: [userMessage, streaming], isStreaming: false }),
      ),
    );
    expect(screen.queryByText('Thinking…')).toBeNull();
  });

  it('keeps assistant prose and structured blocks inside one assistant turn surface', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            userMessage,
            {
              ...assistantMessage,
              messageBlocks: [
                {
                  id: 'block-1',
                  runId: null,
                  blockType: 'text',
                  payload: { text: 'A structured observation.' },
                  fallbackText: 'Structured observation',
                },
              ],
            },
          ],
        }),
      ),
    );

    expect(container.querySelectorAll('[data-assistant-turn="true"]')).toHaveLength(1);
  });

  it('renders assistant content as Markdown without an avatar, header, or bubble surface', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            userMessage,
            {
              ...assistantMessage,
              content: '# Weekly summary\n\nResults are **ready**.',
            },
          ],
        }),
      ),
    );

    expect(screen.getByRole('heading', { name: 'Weekly summary' })).toBeTruthy();
    expect(screen.getByText('ready')).toBeTruthy();
    expect(container.querySelector('[data-slot="message-avatar"]')).toBeNull();
    expect(container.querySelector('[data-slot="message-header"]')).toBeNull();

    const assistantSurface = container.querySelector('[data-assistant-turn="true"]');
    expect(assistantSurface?.className).not.toContain('rounded-xl');
    expect(assistantSurface?.className).not.toContain('bg-');
  });

  it('holds the transcript to one reading column and shows a reminder as a status', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            userMessage,
            {
              ...assistantMessage,
              content: '<system-reminder>\nPrevious tool call failed.\n</system-reminder>',
            },
          ],
        }),
      ),
    );

    expect(screen.getByRole('status', { name: 'System update' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Previous tool call failed.');
    /*
     * One column owns the width. The scroller used to say 960px while the
     * assistant's own prose said 896px and the composer said 960px again, which
     * put 121 characters on a line. The column is 768px now, the width
     * ChatGPT's thread settles on (about 105 characters at 14px).
     */
    expect(container.querySelector('[data-slot="message-scroller-content"]')?.className).toContain(
      'max-w-3xl',
    );
    expect(container.querySelector('[data-assistant-turn="true"]')?.className).not.toMatch(
      /max-w-/u,
    );
  });

  /*
   * Every message with content used to carry a clock, so eight of them ran
   * down a four-question conversation and the only thing they distinguished
   * was 10:42 from 10:43.
   */
  it('keeps the send time as a machine-readable <time>, out of the resting page', () => {
    const { container } = render(createElement(ChatMessageList, baseProps()));

    const times = [...container.querySelectorAll('time')];
    expect(times).toHaveLength(2);
    expect(times.map((node) => node.getAttribute('datetime'))).toEqual([
      '2026-09-05T08:00:00.000Z',
      '2026-09-05T08:00:05.000Z',
    ]);
    /* The user's bubble hides its clock outright; the assistant's footer holds
       the run inspector too, so the newest turn keeps it. */
    const [userTime, assistantTime] = times;
    expect(userTime?.className).toContain('opacity-0');
    expect(userTime?.className).toContain('group-hover/message:opacity-100');
    expect(assistantTime?.closest('div')?.className).toContain('opacity-100');
    expect(container.querySelectorAll('.group\\/message').length).toBeGreaterThan(0);
  });

  /*
   * The agent injects a reminder between turns and the transcript rendered one
   * grey row for each. Four rows that say nothing about what was updated are
   * four rows of noise.
   */
  it('collapses a run of system updates into one counted marker', () => {
    const reminder = (id: string): DisplayMessage => ({
      ...userMessage,
      id,
      content: `<system-reminder>\nControl text ${id}\n</system-reminder>`,
    });
    const messageRowRefs = { current: new Map<string, HTMLDivElement>() };

    render(
      createElement(
        ChatMessageList,
        baseProps({
          messageRowRefs,
          messages: [userMessage, reminder('r1'), reminder('r2'), reminder('r3'), assistantMessage],
        }),
      ),
    );

    expect(screen.getByRole('status', { name: '3 system updates' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'System update' })).toBeNull();
    // The timeline rail scrolls to a message by id; an id with no node is a dead jump.
    for (const id of ['r1', 'r2', 'r3']) expect(messageRowRefs.current.has(id)).toBe(true);
  });

  it('still names a lone system update in the singular', () => {
    render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            { ...userMessage, content: '<system-reminder>\nControl text\n</system-reminder>' },
            assistantMessage,
          ],
        }),
      ),
    );

    expect(screen.getByRole('status', { name: 'System update' })).toBeTruthy();
  });

  it('does not expose reminder-only user content as a chat bubble', () => {
    const { container } = render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            {
              ...userMessage,
              content: '<system-reminder>\nInternal control text\n</system-reminder>',
            },
            { ...assistantMessage, content: '' },
          ],
        }),
      ),
    );

    expect(screen.getByRole('status', { name: 'System update' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Internal control text');
    expect(container.querySelectorAll('[data-slot="bubble-content"]')).toHaveLength(0);
  });

  it('renders only the newest runtime approval card', () => {
    const approval = (id: string, runId: string, expiresAt: string): DisplayMessage => ({
      id,
      role: 'assistant',
      content: '',
      timestamp: '2026-09-05T08:00:05.000Z',
      runId,
      runAwaitingApproval: true,
      awaitingApproval: {
        approvalId: id,
        action: 'mcp__skill__create_skill',
        preview: 'Tool arguments redacted.',
        expiresAt,
      },
    });

    render(
      createElement(
        ChatMessageList,
        baseProps({
          messages: [
            userMessage,
            approval('expired-approval', 'old-run', '2020-01-01T00:00:00.000Z'),
            { ...userMessage, id: 'm3', content: 'Create another skill' },
            approval('current-approval', 'new-run', '2099-01-01T00:00:00.000Z'),
          ],
          onApprovalDecision: vi.fn().mockResolvedValue(undefined),
        }),
      ),
    );

    expect(screen.getAllByRole('group', { name: 'Agent approval request' })).toHaveLength(1);
    expect(screen.getByText('Waiting for your approval')).toBeTruthy();
  });
});
