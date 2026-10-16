// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { ConversationsMenu } from '@/app/(workspace)/chat/_components/conversations-menu';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useChatSessionsStore.setState({
    sessions: [
      {
        id: 's1',
        roomId: 'r1',
        title: 'Weekly ops review',
        messages: [],
        databaseName: null,
        agentName: null,
      },
      {
        id: 's2',
        roomId: null,
        title: 'Untitled',
        messages: [],
        databaseName: null,
        agentName: null,
      },
    ],
    activeSessionId: 's1',
    hydrated: true,
  });
});

// jsdom has no PointerEvent, so the trigger is opened the way a keyboard user
// opens it — the same path shared-ui-kit's dropdown test pins.
function openMenu(): void {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Conversations' }), { key: 'Enter' });
}

describe('ConversationsMenu', () => {
  it('lists every session from the store by title once opened', async () => {
    render(createElement(ConversationsMenu, { activeId: 's1', onSelect: vi.fn(), onNew: vi.fn() }));
    openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Weekly ops review' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Untitled' })).toBeTruthy();
  });

  it('calls onSelect with the clicked session id', async () => {
    const onSelect = vi.fn();
    render(createElement(ConversationsMenu, { activeId: 's1', onSelect, onNew: vi.fn() }));
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Untitled' }));
    expect(onSelect).toHaveBeenCalledWith('s2');
  });

  it('calls onNew from the new-conversation item', async () => {
    const onNew = vi.fn();
    render(createElement(ConversationsMenu, { activeId: 's1', onSelect: vi.fn(), onNew }));
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New conversation' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('filters recent conversations from the search field', async () => {
    render(createElement(ConversationsMenu, { activeId: 's1', onSelect: vi.fn(), onNew: vi.fn() }));
    openMenu();
    const search = await screen.findByRole('searchbox', { name: 'Search conversations' });
    fireEvent.change(search, { target: { value: 'ops' } });

    expect(screen.getByRole('menuitem', { name: 'Weekly ops review' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Untitled' })).toBeNull();
  });
});
