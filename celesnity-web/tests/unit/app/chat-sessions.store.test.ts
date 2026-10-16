// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const { listSessions, getInjection } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getInjection: vi.fn(() => ({ listSessions })),
}));

vi.mock('@/di/container', () => ({ getInjection }));

import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';
import type { ChatSession, DisplayMessage } from '@/app/_components/chat/types';

afterEach(() => {
  listSessions.mockReset();
});

const message = (overrides: Partial<DisplayMessage> = {}): DisplayMessage => ({
  id: 'msg-1',
  role: 'user',
  content: 'hello',
  timestamp: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const session = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-abc',
  roomId: 'room-1',
  title: 'local title',
  agentName: null,
  messages: [],
  databaseName: null,
  ...overrides,
});

// Waits for the microtask queue the store's fire-and-forget
// `refreshFromServer` promise runs on, without depending on its internals.
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useChatSessionsStore', () => {
  it('starts empty and marks itself hydrated before the server responds — nothing is cached locally to render instantly from', () => {
    listSessions.mockReturnValue(new Promise(() => {})); // never resolves in this test

    useChatSessionsStore.getState().hydrate('user-sync');

    expect(useChatSessionsStore.getState().hydrated).toBe(true);
    expect(useChatSessionsStore.getState().sessions).toEqual([]);
  });

  it('populates sessions once listSessions resolves', async () => {
    listSessions.mockResolvedValue([
      { id: 'session-abc', roomId: 'room-1', title: 'real server title', agentName: 'writer' },
    ]);

    useChatSessionsStore.getState().hydrate('user-populate');
    await flush();

    expect(useChatSessionsStore.getState().sessions).toEqual([
      session({ title: 'real server title', agentName: 'writer' }),
    ]);
  });

  it('preserves messages and databaseName from a send that lands while the server is still answering', async () => {
    // A conversation whose messages/databaseName were set locally (an
    // in-flight send, not anything persisted) after hydrate() cleared the
    // list but before listSessions resolved — reconciliation must fold the
    // server's title into it, not clobber it.
    listSessions.mockResolvedValue([
      { id: 'session-abc', roomId: 'room-1', title: 'real server title', agentName: 'writer' },
    ]);

    useChatSessionsStore.getState().hydrate('user-preserve');
    useChatSessionsStore
      .getState()
      .setSessions([session({ messages: [message()], databaseName: 'sample' })]);
    await flush();

    const [merged] = useChatSessionsStore.getState().sessions;
    expect(merged?.messages).toEqual([message()]);
    expect(merged?.databaseName).toBe('sample');
    expect(merged?.title).toBe('real server title');
    expect(merged?.agentName).toBe('writer');
  });

  it('keeps a conversation whose room was never created — the server cannot know about it yet', async () => {
    listSessions.mockResolvedValue([]); // server knows of no rooms at all

    useChatSessionsStore.getState().hydrate('user-draft');
    const draft = session({ id: 'session-draft', roomId: null, title: 'draft, no room yet' });
    useChatSessionsStore.getState().setSessions([draft]);
    await flush();

    expect(useChatSessionsStore.getState().sessions).toEqual([draft]);
  });

  it('leaves the in-progress list untouched when the server is unreachable', async () => {
    listSessions.mockRejectedValue(new Error('network error'));

    useChatSessionsStore.getState().hydrate('user-offline');
    useChatSessionsStore.getState().setSessions([session()]);
    await flush();

    expect(useChatSessionsStore.getState().sessions).toEqual([session()]);
  });
});
