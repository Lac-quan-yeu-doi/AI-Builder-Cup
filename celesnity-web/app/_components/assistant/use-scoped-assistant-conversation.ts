'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useCurrentUserId } from '@/app/_providers/current-user-provider';
import {
  useChatConversation,
  type ChatConversationStore,
  type UseChatConversationOptions,
  type UseChatConversationResult,
} from '@/app/_components/chat/use-chat-conversation';
import type { DisplayMessage } from '@/app/_components/chat/types';
import type {
  AssistantChatControllers,
  AssistantHistoryItem,
} from '@/app/_components/assistant/assistant-panel';
import { getInjection } from '@/di/container';
import type { ChatSessionSummary } from '@/src/entities/models/chat';
import type { ManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';

import { useAssistantControllers } from './use-assistant-dock';

const controller = getInjection('ManageChatController');
const listMessageBlockHistory = getInjection('ListMessageBlockHistoryController');
const subscribeMessageBlocks = getInjection('SubscribeMessageBlocksController');

/** Options shared by panels whose conversation is owned by one scoped surface. */
export type ScopedAssistantConversationOptions = Omit<
  UseChatConversationOptions,
  | 'userId'
  | 'controller'
  | 'listMessageBlockHistory'
  | 'subscribeMessageBlocks'
  | 'store'
  | 'preserveStoreOnConversationChange'
  | 'roomKey'
> & {
  /** Stable scope used to isolate this panel's rooms from other surfaces. */
  readonly conversationNamespace: string;
  /** Deterministic key used by the pre-history version of this panel. */
  readonly legacyConversationKey?: string;
};

export interface ScopedAssistantHistoryItem extends AssistantHistoryItem {
  readonly roomId: string;
}

export interface ScopedAssistantConversationResult extends UseChatConversationResult {
  readonly chatController: ManageChatController;
  readonly controllers: AssistantChatControllers;
  readonly messages: readonly DisplayMessage[];
  readonly roomId: string | null;
  readonly setMessages: ChatConversationStore['setMessages'];
  readonly userId: string;
  readonly history: readonly ScopedAssistantHistoryItem[];
  readonly historyLoading: boolean;
  readonly activeConversationId: string | null;
  readonly startNewConversation: () => void;
  readonly selectConversation: (id: string) => void;
}

interface ActiveConversation {
  readonly namespace: string;
  readonly key: string;
  readonly roomId: string | null;
}

interface ScopedConversationState {
  readonly activeConversation: ActiveConversation;
  readonly messages: readonly DisplayMessage[];
  readonly generation: number;
}

function newConversation(
  namespace: string,
  instanceId: string,
  generation: number,
): ActiveConversation {
  return {
    namespace,
    key: `${namespace}:${instanceId}:${generation}`,
    roomId: null,
  };
}

function newConversationState(
  namespace: string,
  instanceId: string,
  generation: number,
): ScopedConversationState {
  return {
    activeConversation: newConversation(namespace, instanceId, generation),
    messages: [],
    generation,
  };
}

function belongsToNamespace(
  summary: ChatSessionSummary,
  namespace: string,
  legacyConversationKey: string | undefined,
): boolean {
  return (
    summary.id === namespace ||
    summary.id.startsWith(`${namespace}:`) ||
    summary.id === legacyConversationKey
  );
}

/**
 * Shared room-backed conversation state for docked assistant panels.
 *
 * The full chat screen owns an external multi-session store, so it continues
 * to call `useChatConversation` directly. Every scoped panel uses this hook
 * instead: one local store, one room lifecycle, and the same assistant surface.
 */
export function useScopedAssistantConversation(
  options: ScopedAssistantConversationOptions,
): ScopedAssistantConversationResult {
  const userId = useCurrentUserId();
  const controllers = useAssistantControllers();
  const instanceId = useId();
  const { conversationNamespace, legacyConversationKey, ...conversationOptions } = options;
  const [conversationState, setConversationState] = useState<ScopedConversationState>(() =>
    newConversationState(conversationNamespace, instanceId, 0),
  );
  const [history, setHistory] = useState<readonly ScopedAssistantHistoryItem[]>([]);
  const [historyNamespace, setHistoryNamespace] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const historyRequestRef = useRef(0);

  const scopeChanged = conversationState.activeConversation.namespace !== conversationNamespace;
  let renderState = conversationState;
  if (scopeChanged) {
    renderState = newConversationState(
      conversationNamespace,
      instanceId,
      conversationState.generation + 1,
    );
    setConversationState(renderState);
  }
  const { activeConversation: renderConversation, messages } = renderState;

  const setMessages = useCallback<ChatConversationStore['setMessages']>((updater) => {
    setConversationState((current) => ({
      ...current,
      messages: updater(current.messages),
    }));
  }, []);
  const setRoomId = useCallback(
    (nextRoomId: string | null) => {
      setConversationState((current) =>
        current.activeConversation.namespace === conversationNamespace
          ? {
              ...current,
              activeConversation: { ...current.activeConversation, roomId: nextRoomId },
            }
          : current,
      );
    },
    [conversationNamespace],
  );
  const store = useMemo<ChatConversationStore>(
    () => ({
      messages,
      roomId: renderConversation.roomId,
      setMessages,
      setRoomId,
    }),
    [messages, renderConversation.roomId, setMessages, setRoomId],
  );

  const loadHistory = useCallback(
    async (requestId: number) => {
      try {
        const summaries = await controller.listSessions(userId);
        if (requestId !== historyRequestRef.current) return;
        setHistory(
          summaries
            .filter((summary) =>
              belongsToNamespace(summary, conversationNamespace, legacyConversationKey),
            )
            .map(({ id, roomId, title }) => ({ id, roomId, title })),
        );
        setHistoryNamespace(conversationNamespace);
      } catch {
        if (requestId !== historyRequestRef.current) return;
        setHistory([]);
        setHistoryNamespace(conversationNamespace);
      } finally {
        if (requestId === historyRequestRef.current) setHistoryLoading(false);
      }
    },
    [conversationNamespace, legacyConversationKey, userId],
  );

  const refreshHistory = useCallback(() => {
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    setHistoryLoading(true);
    void loadHistory(requestId);
  }, [loadHistory]);

  useEffect(() => {
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    void loadHistory(requestId);
    return () => {
      if (historyRequestRef.current === requestId) historyRequestRef.current += 1;
    };
  }, [loadHistory]);

  const startNewConversation = useCallback(() => {
    setConversationState((current) =>
      newConversationState(conversationNamespace, instanceId, current.generation + 1),
    );
  }, [conversationNamespace, instanceId]);

  const selectConversation = useCallback(
    (id: string) => {
      const selected = history.find((item) => item.id === id);
      if (!selected) return;
      setConversationState((current) => ({
        activeConversation: {
          namespace: conversationNamespace,
          key: selected.id,
          roomId: selected.roomId,
        },
        messages: [],
        generation: current.generation + 1,
      }));
    },
    [conversationNamespace, history],
  );

  const conversation = useChatConversation({
    ...conversationOptions,
    roomKey: renderConversation.key,
    userId,
    controller,
    listMessageBlockHistory,
    subscribeMessageBlocks,
    store,
    preserveStoreOnConversationChange: true,
    onRunFinished: (status) => {
      options.onRunFinished?.(status);
      if (status !== 'awaiting_client_tool' && status !== 'awaiting_input') {
        refreshHistory();
      }
    },
  });

  const historyMatchesScope = historyNamespace === conversationNamespace;
  return {
    ...conversation,
    error: scopeChanged ? null : conversation.error,
    isStreaming: scopeChanged ? false : conversation.isStreaming,
    messages,
    restoredArtifacts: scopeChanged ? [] : conversation.restoredArtifacts,
    chatController: controller,
    controllers,
    roomId: renderConversation.roomId,
    setMessages,
    userId,
    history: historyMatchesScope ? history : [],
    historyLoading: !historyMatchesScope || historyLoading,
    activeConversationId: renderConversation.roomId === null ? null : renderConversation.key,
    startNewConversation,
    selectConversation,
  };
}
