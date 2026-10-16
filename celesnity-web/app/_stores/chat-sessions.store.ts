'use client';

import { create } from 'zustand';

import type { ChatSession } from '@/app/_components/chat/types';
import { getInjection } from '@/di/container';

type SessionsUpdater =
  readonly ChatSession[] | ((current: readonly ChatSession[]) => ChatSession[]);

interface ChatSessionsState {
  readonly sessions: readonly ChatSession[];
  readonly activeSessionId: string | null;
  /** Whether `hydrate` has run; before it has, the list is deliberately empty. */
  readonly hydrated: boolean;
  readonly setSessions: (updater: SessionsUpdater) => void;
  readonly setActiveSessionId: (id: string | null) => void;
  readonly hydrate: (userId: string) => void;
}

/**
 * The conversations held for the current page load.
 *
 * A store rather than the chat screen's own state because the sidebar lists the
 * same conversations, and the two are unrelated components on different routes
 * — the case `skills/state-management` reserves for Zustand.
 *
 * Deliberately not persisted (no `localStorage`, no `persist` middleware):
 * this is server data (minder-agent owns which conversations exist — see
 * `AgentApiChatRepository.createRoom`), and per `skills/state-management`'s
 * own "common mistakes" table, caching server data in a store just drifts
 * from the API. A caller that clears its history server-side expects the UI
 * to reflect that on the next load, not keep showing a stale local copy.
 *
 * `hydrated` plays the part `skipHydration` plays for `locale.store`: the first
 * client render matches the server's empty list, and `hydrate` fills it from an
 * effect after mount.
 */
export const useChatSessionsStore = create<ChatSessionsState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  hydrated: false,

  setSessions: (updater) => {
    const sessions = typeof updater === 'function' ? updater(get().sessions) : [...updater];
    set({ sessions });
  },

  setActiveSessionId: (activeSessionId) => {
    set({ activeSessionId });
  },

  hydrate: (userId) => {
    // Idempotent, because more than one component asks for it: the sidebar
    // needs the conversations on every route, the chat screen needs them on
    // its own. A second read would be harmless but a badly timed one would
    // not — it would overwrite whatever the screen had changed since.
    if (get().hydrated && hydratedUserId === userId) return;
    hydratedUserId = userId;
    // Empty until the server answers — see the class doc: nothing is cached
    // locally to render instantly from.
    set({ sessions: [], activeSessionId: null, hydrated: true });
    void refreshFromServer(userId);
  },
}));

async function refreshFromServer(userId: string): Promise<void> {
  try {
    const summaries = await getInjection('ManageChatController').listSessions(userId);
    const current = useChatSessionsStore.getState().sessions;
    const currentById = new Map(current.map((session) => [session.id, session]));
    const fromServer: ChatSession[] = summaries.map((summary) => {
      const local = currentById.get(summary.id);
      return {
        id: summary.id,
        roomId: summary.roomId,
        title: summary.title,
        agentName: summary.agentName ?? local?.agentName ?? null,
        // Messages hydrate lazily per-conversation (see chat-screen.tsx's
        // transcript effect) — carried over here only so switching to an
        // already-open conversation doesn't blank it out from under the user.
        messages: local?.messages ?? [],
        databaseName: local?.databaseName ?? null,
      };
    });
    // A conversation whose first message hasn't round-tripped yet (still
    // `roomId: null`) has no room for the server to know about — keep it
    // rather than let this reconciliation erase someone's in-progress chat.
    const serverIds = new Set(summaries.map((summary) => summary.id));
    const localOnly = current.filter((session) => !serverIds.has(session.id));
    useChatSessionsStore.getState().setSessions([...localOnly, ...fromServer]);
  } catch {
    // Offline or minder-agent unreachable — whatever `hydrate` already set
    // (empty, or since grown by an in-flight send) stands; nothing to
    // reconcile against.
  }
}

/**
 * The user whose conversations are loaded. Set by `hydrate`, so a second
 * `hydrate` call for the same user is a no-op (see its idempotency guard).
 */
let hydratedUserId: string | null = null;
