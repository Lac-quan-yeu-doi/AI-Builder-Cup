// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatTimelineRail } from '@/app/(workspace)/chat/_components/chat-timeline-rail';
import { renderUi } from '@/tests/support/render-ui';
import type { DisplayMessage } from '@/app/_components/chat/types';

afterEach(() => {
  cleanup();
});

const userMessage = (id: string, content: string): DisplayMessage => ({
  id,
  role: 'user',
  content,
  timestamp: '2026-08-24T00:00:00.000Z',
});

const assistantMessage = (
  id: string,
  content: string,
  overrides: Partial<DisplayMessage> = {},
): DisplayMessage => ({
  id,
  role: 'assistant',
  content,
  timestamp: '2026-08-24T00:00:01.000Z',
  ...overrides,
});

describe('ChatTimelineRail', () => {
  it('lists every message with content, calling onSelect with its id when clicked', () => {
    const onSelect = vi.fn();
    const messages = [
      userMessage('m1', 'What was revenue last quarter?'),
      assistantMessage('m2', 'Revenue was $1.2M, up 8% quarter over quarter.'),
    ];

    renderUi(createElement(ChatTimelineRail, { messages, onSelect, onClose: vi.fn() }));

    fireEvent.click(screen.getByText('What was revenue last quarter?'));
    expect(onSelect).toHaveBeenCalledWith('m1');

    fireEvent.click(screen.getByText('Revenue was $1.2M, up 8% quarter over quarter.'));
    expect(onSelect).toHaveBeenCalledWith('m2');
  });

  it('shows a tool-call count for an assistant message that ran tools', () => {
    const messages = [
      assistantMessage('m1', 'Here is the breakdown.', {
        toolActivity: [
          { id: 't1', name: 'trino_query', status: 'done' },
          { id: 't2', name: 'create_chart', status: 'done' },
        ],
      }),
    ];

    renderUi(createElement(ChatTimelineRail, { messages, onSelect: vi.fn(), onClose: vi.fn() }));

    expect(screen.getByText('2 tool calls')).toBeDefined();
  });

  it('excludes publish_message_block from the tool count, matching the transcript', () => {
    const messages = [
      assistantMessage('m1', 'Done.', {
        toolActivity: [
          { id: 't1', name: 'publish_message_block', status: 'done' },
          { id: 't2', name: 'create_chart', status: 'done' },
        ],
      }),
    ];

    renderUi(createElement(ChatTimelineRail, { messages, onSelect: vi.fn(), onClose: vi.fn() }));

    expect(screen.getByText('1 tool calls')).toBeDefined();
  });

  it('omits an assistant entry with no content and no visible tool calls (a streaming placeholder)', () => {
    const messages = [
      userMessage('m1', 'Hi'),
      assistantMessage('m2', '', {
        toolActivity: [{ id: 't1', name: 'publish_message_block', status: 'running' }],
      }),
    ];

    renderUi(createElement(ChatTimelineRail, { messages, onSelect: vi.fn(), onClose: vi.fn() }));

    expect(screen.getByText('Hi')).toBeDefined();
    expect(screen.queryByText('…')).toBeNull();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();

    renderUi(
      createElement(ChatTimelineRail, {
        messages: [userMessage('m1', 'Hi')],
        onSelect: vi.fn(),
        onClose,
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide conversation timeline' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('redacts system-reminder content from the timeline label', () => {
    renderUi(
      createElement(ChatTimelineRail, {
        messages: [
          assistantMessage('m1', '<system-reminder>\nInternal control text\n</system-reminder>'),
        ],
        onSelect: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(screen.getByRole('button', { name: /System update/ })).toBeDefined();
    expect(document.body.textContent).not.toContain('Internal control text');
  });
});
