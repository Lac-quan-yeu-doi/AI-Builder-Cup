// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatLanding } from '@/app/_components/chat/chat-landing';
import { renderUi } from '@/tests/support/render-ui';

afterEach(cleanup);

describe('ChatLanding', () => {
  it('renders the supplied conversation access point above the empty state', () => {
    renderUi(
      createElement(ChatLanding, {
        pending: false,
        connectionStatus: 'connected',
        onSubmit: () => undefined,
        header: createElement('button', { type: 'button' }, 'Conversation switcher'),
      }),
    );

    expect(screen.getByRole('button', { name: 'Conversation switcher' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Suggested prompts' })).toBeTruthy();
  });

  /*
   * Checking resolves in under a second and means nothing is wrong, so it used
   * to put an orange uppercase CHECKING badge — the loudest thing on the page —
   * on a workspace that was fine. Only one of the three states is news.
   */
  it.each([
    ['connected' as const, 'Connected to workspace data'],
    ['checking' as const, 'Checking the connection\u2026'],
  ])('keeps the %s line quiet', (connectionStatus, label) => {
    renderUi(
      createElement(ChatLanding, { pending: false, connectionStatus, onSubmit: () => undefined }),
    );

    const line = screen.getByRole('status');
    expect(line.textContent).toContain(label);
    expect(line.className).toContain('border-transparent');
    expect(line.className).not.toMatch(/status-warning|bg-destructive/u);
  });

  it('marks an unreachable chat service, which is the state worth a border', () => {
    renderUi(
      createElement(ChatLanding, {
        pending: false,
        connectionStatus: 'offline',
        onSubmit: () => undefined,
      }),
    );

    const line = screen.getByRole('status');
    expect(line.textContent).toContain('Chat service is unavailable');
    expect(line.className).toContain('text-destructive');
  });

  /* A title is the first sixty characters of the first message, so two runs at
     the same starter give two rows reading "Visualize my data" and nothing
     else. */
  it('names what a recent conversation was about, when it was scoped to one', () => {
    renderUi(
      createElement(ChatLanding, {
        pending: false,
        connectionStatus: 'connected',
        onSubmit: () => undefined,
        onSelectRecent: () => undefined,
        recent: [
          { id: 'a', title: 'Visualize my data', subject: 'kasadev' },
          { id: 'b', title: 'Visualize my data', subject: null },
        ],
      }),
    );

    expect(screen.getByText('kasadev')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open Visualize my data' })).toHaveLength(2);
  });
});
