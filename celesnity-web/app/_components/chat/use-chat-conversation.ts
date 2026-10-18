'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/app/_i18n/use-translation';

import { MessageBlockCursorInvalidError } from '@/src/entities/errors/message-block-cursor-invalid-error';
import type {
  MessageBlockCloseReason,
  MessageBlockRecoveryResult,
  MessageBlockStreamState,
} from '@/src/entities/models/message-block-stream';
import type { ChatApprovalDecision, PlantModelToolScope } from '@/src/entities/models/chat';
import type { ManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';
import type { ListMessageBlockHistoryController } from '@/src/interface-adapters/controllers/message-blocks/list-message-block-history.controller';
import type {
  SubscribeMessageBlocksController,
  SubscribeMessageBlocksControllerHandlers,
} from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';
import type { MessageBlockViewModel } from '@/src/interface-adapters/presenters/message-block.presenter';
import {
  createResilientStream,
  type ResilientStreamHandle,
  type StreamConnectionStatus,
} from './use-resilient-stream';
import {
  parseSseStream,
  StreamDisconnectedError,
  type ToolEvent,
  type WorkspaceChange,
} from './parse-sse-stream';
import { executeClientTool } from './client-tool-executor';
import { mergeTranscriptMessages } from './chat-transcript-merge';
import { hydrateChatRunHistory } from './chat-run-history';
import { applyToolEvent } from './tool-activity';
import { mergeRestoredBlocks, splitRestoredBlocks } from './restored-blocks';
import type { DisplayMessage } from './types';
import {
  runErrorFromEvent,
  shouldShowStructuredRunError,
  toFriendlyRunError,
} from './activity-display';

function messageBlockFailureStatus(failure: unknown): number | undefined {
  // Repository errors preserve the HTTP error as a cause; stream errors expose it directly.
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof failure !== 'object' || failure === null) return undefined;
    if ('status' in failure && typeof failure.status === 'number') return failure.status;
    failure = 'cause' in failure ? failure.cause : undefined;
  }
  return undefined;
}

function hasAssistantOutput(message: DisplayMessage): boolean {
  return Boolean(
    message.content.trim() ||
    message.reasoning?.trim() ||
    message.messageBlocks?.length ||
    message.toolActivity?.length ||
    message.runAwaitingInput ||
    message.runAwaitingApproval ||
    ('runAwaitingPlan' in message && message.runAwaitingPlan),
  );
}

export interface ChatConversationStore {
  readonly messages: readonly DisplayMessage[];
  readonly roomId: string | null;
  setMessages(updater: (messages: readonly DisplayMessage[]) => readonly DisplayMessage[]): void;
  setRoomId(roomId: string | null): void;
}

export interface UseChatConversationOptions {
  /**
   * Overrides which agent this conversation's room uses. Omit it to let
   * `AgentApiChatRepository` fall back to `publicEnvironment.chatAgentName`
   * itself (the general chat page's behavior) — only read a `publicEnvironment`
   * getter here directly if it's guaranteed not to throw, since this value is
   * read on every render, not lazily at send time.
   */
  readonly agentName?: string;
  readonly roomKey: string;
  readonly userId: string;
  readonly controller: ManageChatController;
  readonly listMessageBlockHistory: ListMessageBlockHistoryController;
  readonly subscribeMessageBlocks: SubscribeMessageBlocksController;
  readonly store: ChatConversationStore;
  readonly title?: string;
  /** Sent on every message, not just the room's first — a run's data-tool
   *  access is scoped fresh each time, unlike `title` which is fixed at
   *  room creation. */
  readonly dataScope?: { readonly schema: string };
  /** Typed Plant Model tool binding supplied fresh for every run. */
  readonly plantModelScope?: PlantModelToolScope;
  /**
   * Keep the caller-owned store when the conversation identity changes. The
   * general chat screen uses this because its store already points at the
   * newly selected session; scoped panels leave it false so a stale room id
   * cannot leak into the next skill, workflow, or plant model.
   */
  readonly preserveStoreOnConversationChange?: boolean;
  /** Shown when `send` fails with an error carrying no message of its own.
   *  Defaults to a generic fallback — pass a translated string for a
   *  caller-specific one (e.g. `t('chat.error')`). */
  readonly errorFallbackMessage?: string;
  readonly onTokenUsage?: (delta: { input: number; output: number }) => void;
  readonly onContextUsagePct?: (pct: number) => void;
  readonly onApplicationStateSet?: (update: { name: string; value: unknown }) => void;
  readonly onWorkspaceChanged?: (
    changes: readonly WorkspaceChange[],
    roomId: string | null,
  ) => void;
  readonly onToolFinished?: (name: string) => void;
  readonly onRunFinished?: (status: string) => void;
}

export interface UseChatConversationResult {
  readonly isStreaming: boolean;
  readonly error: string | null;
  readonly restoredArtifacts: readonly MessageBlockViewModel[];
  readonly streamStatus: StreamConnectionStatus;
  readonly messageBlockStreamStatus: MessageBlockStreamState;
  send(text: string, displayText?: string): Promise<void>;
  /** Asks for the newest answer again, in place; the question is not re-sent. */
  regenerate(assistantMessageId: string): void;
  reconnect(): void;
  disconnect(): void;
  decideApproval(runId: string, approvalId: string, decision: ChatApprovalDecision): Promise<void>;
}

export function useChatConversation(
  options: UseChatConversationOptions,
): UseChatConversationResult {
  const { t } = useTranslation();
  const {
    agentName,
    roomKey,
    userId,
    controller,
    listMessageBlockHistory,
    subscribeMessageBlocks,
    store,
    title,
    dataScope,
    plantModelScope,
    errorFallbackMessage,
    preserveStoreOnConversationChange = false,
  } = options;
  const [messageBlockStreamStatus, setMessageBlockStreamStatus] =
    useState<MessageBlockStreamState>('reconnecting');
  const latestStoreRef = useRef(store);
  const resumeBlocksRef = useRef<(retryFailed?: boolean) => Promise<void>>(async () => undefined);
  const blockCursorRef = useRef<{ roomId: string; id?: string } | null>(null);
  const blockRestorationRef = useRef<{
    roomId: string;
    generation: number;
    promise: Promise<void>;
  } | null>(null);
  const projectionRestorationRef = useRef<{
    roomId: string;
    generation: number;
    reset: boolean;
    promise: Promise<MessageBlockRecoveryResult>;
  } | null>(null);
  useEffect(() => {
    latestStoreRef.current = store;
  }, [store]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamConnectionStatus>('connected');
  const messageBlockSubscriptionRef = useRef<{
    roomId: string;
    state: MessageBlockStreamState;
    close: (reason?: MessageBlockCloseReason) => void;
  } | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const runStateRevisionRef = useRef(0);
  const registeredRunIdRef = useRef<string | null>(null);
  const persistentAbortRef = useRef<AbortController | null>(null);
  const approvalAbortRef = useRef<AbortController | null>(null);
  const resilientHandleRef = useRef<ResilientStreamHandle | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const pendingClientToolResultRef = useRef<string | null>(null);
  const activeToolNamesRef = useRef(new Map<string, Map<string, string>>());
  const pendingMessageBlocksRef = useRef(new Map<string, readonly MessageBlockViewModel[]>());
  const conversationGenerationRef = useRef(0);
  const conversationIdentity = `${userId}\u0000${agentName ?? ''}\u0000${roomKey}`;
  const previousConversationIdentityRef = useRef(conversationIdentity);
  const previousSelectedRoomRef = useRef(store.roomId);
  const [restoredArtifacts, setRestoredArtifacts] = useState<readonly MessageBlockViewModel[]>([]);
  const sendRef = useRef<((text: string) => Promise<void>) | null>(null);

  const updateActiveMessage = useCallback(
    (updater: (message: DisplayMessage) => DisplayMessage) => {
      store.setMessages((prev) => {
        const updated = [...prev];
        const activeRunId = activeRunIdRef.current;
        let assistantIndex = updated.length - 1;
        if (activeRunId !== null) {
          assistantIndex = -1;
          for (let index = updated.length - 1; index >= 0; index -= 1) {
            const message = updated[index];
            if (message?.role === 'assistant' && message.runId === activeRunId) {
              assistantIndex = index;
              break;
            }
          }
        }
        const assistant = updated[assistantIndex];
        if (assistant?.role === 'assistant') updated[assistantIndex] = updater(assistant);
        return updated;
      });
    },
    [store],
  );

  const appendActiveEvent = useCallback(
    (runId: string, event: { readonly type: string; readonly data?: unknown }, seq?: string) => {
      if (runId !== activeRunIdRef.current) return;
      updateActiveMessage((last) => {
        const numericSeq = Number.parseInt(seq?.split(':').at(-1) ?? '', 10);
        const events = [...(last.eventTrace ?? [])];
        const eventSeq = Number.isInteger(numericSeq) ? numericSeq : (events.at(-1)?.seq ?? 0) + 1;
        if (events.some((candidate) => candidate.seq === eventSeq)) return last;
        const runError = last.runError ?? runErrorFromEvent(event.type, event.data);
        return {
          ...last,
          eventTrace: [
            ...events,
            {
              seq: eventSeq,
              type: event.type,
              ...(event.data === undefined ? {} : { data: event.data }),
            },
          ],
          ...(runError ? { runError } : {}),
        };
      });
    },
    [updateActiveMessage],
  );

  const openPersistentStream = useCallback(
    async (roomId: string, forceReconnect = false) => {
      if (
        !forceReconnect &&
        currentRoomIdRef.current === roomId &&
        persistentAbortRef.current &&
        !persistentAbortRef.current.signal.aborted &&
        resilientHandleRef.current
      ) {
        // A send starts the room stream before it promotes the draft to a
        // server room. The room-id effect runs immediately afterwards; it
        // must reuse that in-flight connection rather than aborting it while
        // `fetch()` is still waiting for the SSE headers.
        return;
      }
      if (persistentAbortRef.current) persistentAbortRef.current.abort();

      const abort = new AbortController();
      persistentAbortRef.current = abort;
      currentRoomIdRef.current = roomId;

      const handle = createResilientStream(
        (lastSeq, streamSignal) => controller.streamEvents(userId, roomId, lastSeq, streamSignal),
        { baseDelayMs: 1_000, maxDelayMs: 30_000, maxRetries: Infinity, jitterFactor: 0.3 },
      );
      resilientHandleRef.current = handle;
      const unsubscribe = handle.onStatusChange((status) => setStreamStatus(status));
      abort.signal.addEventListener('abort', unsubscribe, { once: true });

      const runStreamLoop = async () => {
        try {
          while (!abort.signal.aborted) {
            try {
              const stream = await handle.connect(abort.signal);
              setStreamStatus('connected');

              await parseSseStream(stream, abort.signal, {
                onChunk: (runId, chunk) => {
                  if (runId !== activeRunIdRef.current) return;
                  updateActiveMessage((last) => ({ ...last, content: last.content + chunk }));
                },
                onCompletedResponse: (runId, responseText) => {
                  if (runId !== activeRunIdRef.current) return;
                  const runError = runErrorFromEvent('tool_result', { content: responseText });
                  updateActiveMessage((last) => {
                    if (runError) return { ...last, content: '', runFailed: true, runError };
                    if (!responseText && last.content) return last;
                    if (last.content === responseText) return last;
                    return { ...last, content: responseText };
                  });
                },
                onReasoning: (runId, chunk) => {
                  if (runId !== activeRunIdRef.current) return;
                  updateActiveMessage((last) => ({
                    ...last,
                    reasoning: (last.reasoning ?? '') + chunk,
                  }));
                },
                onToolEvent: (toolEvent: ToolEvent) => {
                  if (toolEvent.runId !== activeRunIdRef.current) return;
                  const toolNames =
                    activeToolNamesRef.current.get(toolEvent.runId) ?? new Map<string, string>();
                  if (toolEvent.status === 'running' && toolEvent.name) {
                    toolNames.set(toolEvent.id, toolEvent.name);
                    activeToolNamesRef.current.set(toolEvent.runId, toolNames);
                  }
                  const toolName = toolEvent.name ?? toolNames.get(toolEvent.id);
                  if (toolEvent.status !== 'running') {
                    toolNames.delete(toolEvent.id);
                    if (toolNames.size === 0) activeToolNamesRef.current.delete(toolEvent.runId);
                    if (toolEvent.status === 'done' && toolName) {
                      options.onToolFinished?.(toolName);
                    }
                  }
                  updateActiveMessage((last) => ({
                    ...last,
                    toolActivity: applyToolEvent(last.toolActivity ?? [], toolEvent, last.content),
                  }));
                },
                onEvent: appendActiveEvent,
                onTokenUsage: (runId, delta) => {
                  if (runId !== activeRunIdRef.current) return;
                  options.onTokenUsage?.(delta);
                },
                onContextUsagePct: (runId, pct) => {
                  if (runId !== activeRunIdRef.current) return;
                  options.onContextUsagePct?.(pct);
                },
                onAwaitingInput: (runId, request) => {
                  if (runId !== activeRunIdRef.current) return;
                  updateActiveMessage((last) => ({
                    ...last,
                    runAwaitingInput: true,
                    awaitingInput: request,
                  }));
                },
                onAwaitingApproval: (runId, request) => {
                  if (runId !== activeRunIdRef.current) return;
                  // Release the composer before publishing the approval card.
                  // The card is stored outside React state, so publishing it
                  // first lets consumers observe the pending approval while
                  // `isStreaming` is still true.
                  setIsStreaming(false);
                  updateActiveMessage((last) => ({
                    ...last,
                    runAwaitingApproval: true,
                    awaitingApproval: request,
                  }));
                  options.onRunFinished?.('awaiting_approval');
                },
                onClientToolCall: (runId, call) => {
                  if (runId !== activeRunIdRef.current) return;
                  const result = executeClientTool(call);
                  updateActiveMessage((last) => {
                    const existing = [...(last.toolActivity ?? [])];
                    existing.push({
                      id: call.id,
                      name: call.name,
                      status: result.success ? 'done' : 'failed',
                    });
                    return { ...last, toolActivity: existing };
                  });
                  pendingClientToolResultRef.current = result.output;
                },
                onApplicationStateSet: (runId, update) => {
                  if (runId !== activeRunIdRef.current || !update.visible) return;
                  options.onApplicationStateSet?.({ name: update.name, value: update.value });
                },
                onWorkspaceChanged: (_runId, changes) =>
                  options.onWorkspaceChanged?.(changes, roomId),
                onRunFinished: (runId, status) => {
                  if (runId !== activeRunIdRef.current) return;
                  activeRunIdRef.current = null;
                  runStateRevisionRef.current += 1;
                  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                    const registeredRunId = registeredRunIdRef.current;
                    registeredRunIdRef.current = null;
                    if (registeredRunId !== null)
                      void controller
                        .closeRunRegistration?.(roomId, registeredRunId)
                        .catch(() => undefined);
                  }
                  activeToolNamesRef.current.delete(runId);
                  setIsStreaming(false);
                  if (status === 'failed')
                    updateActiveMessage((last) => ({
                      ...last,
                      runFailed: true,
                      runError: last.runError ?? toFriendlyRunError(undefined),
                    }));
                  if (status === 'completed')
                    updateActiveMessage((last) =>
                      hasAssistantOutput(last)
                        ? last
                        : {
                            ...last,
                            runFailed: true,
                            runError: last.runError ?? toFriendlyRunError(undefined),
                          },
                    );
                  if (status === 'awaiting_client_tool' && pendingClientToolResultRef.current) {
                    const resultText = pendingClientToolResultRef.current;
                    pendingClientToolResultRef.current = null;
                    void sendRef.current?.(resultText);
                  }
                  options.onRunFinished?.(status);
                },
                onSeq: (seq) => handle.updateLastSeq(seq),
              });

              if (!abort.signal.aborted) {
                // A room stream closes after the current run reaches a
                // terminal event. Do not reconnect an idle room forever; the
                // next send explicitly reopens it with forceReconnect=true.
                if (activeRunIdRef.current === null) break;
                await handle.waitBeforeReconnect(abort.signal);
              }
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') return;
              if (err instanceof StreamDisconnectedError && !abort.signal.aborted) {
                setStreamStatus('reconnecting');
                try {
                  await handle.waitBeforeReconnect(abort.signal);
                } catch (delayError: unknown) {
                  if (delayError instanceof DOMException && delayError.name === 'AbortError')
                    return;
                  throw delayError;
                }
                continue;
              }
              setStreamStatus('disconnected');
              return;
            }
          }
        } finally {
          // Do not clear a newer connection that replaced this one during a
          // room switch or forced reconnect.
          if (persistentAbortRef.current === abort) {
            persistentAbortRef.current = null;
            resilientHandleRef.current = null;
            currentRoomIdRef.current = null;
          }
        }
      };

      void runStreamLoop();
    },
    [appendActiveEvent, controller, updateActiveMessage, userId, options],
  );

  const reconnect = useCallback(() => {
    setError(null);
    if (currentRoomIdRef.current) void openPersistentStream(currentRoomIdRef.current, true);
    const subscription = messageBlockSubscriptionRef.current;
    subscription?.close('manual_reconnect');
    if (subscription) subscription.state = 'paused';
    void resumeBlocksRef.current(true).catch(() => undefined);
  }, [openPersistentStream]);

  /**
   * Tears down the room stream and message-block subscription eagerly, and
   * resets this conversation's local state — for a caller switching to a
   * different conversation (or none) without unmounting this hook instance.
   */
  const disconnect = useCallback(() => {
    conversationGenerationRef.current += 1;
    if (persistentAbortRef.current) {
      persistentAbortRef.current.abort();
      persistentAbortRef.current = null;
    }
    approvalAbortRef.current?.abort();
    approvalAbortRef.current = null;
    resilientHandleRef.current = null;
    activeRunIdRef.current = null;
    runStateRevisionRef.current += 1;
    registeredRunIdRef.current = null;
    activeToolNamesRef.current.clear();
    pendingMessageBlocksRef.current.clear();
    setRestoredArtifacts([]);
    currentRoomIdRef.current = null;
    messageBlockSubscriptionRef.current?.close('room_change');
    messageBlockSubscriptionRef.current = null;
    blockCursorRef.current = null;
    blockRestorationRef.current = null;
    projectionRestorationRef.current = null;
    setMessageBlockStreamStatus('reconnecting');
    setIsStreaming(false);
    setError(null);
    setStreamStatus('connected');
  }, []);

  const decideApproval = useCallback(
    async (runId: string, approvalId: string, decision: ChatApprovalDecision) => {
      const result = await controller.decideRunApproval(userId, runId, approvalId, decision);
      store.setMessages((previous) =>
        previous.map((message) => {
          if (message.runId !== runId || message.awaitingApproval?.approvalId !== approvalId)
            return message;
          return {
            ...message,
            runId: result.continuationRunId ?? runId,
            runAwaitingApproval: false,
            awaitingApproval: undefined,
          };
        }),
      );
      setError(null);
      if (result.continuationRunId === null) {
        activeRunIdRef.current = null;
        runStateRevisionRef.current += 1;
        setIsStreaming(false);
        reconnect();
        return;
      }

      const continuationRunId = result.continuationRunId;
      const abort = new AbortController();
      approvalAbortRef.current?.abort();
      approvalAbortRef.current = abort;
      activeRunIdRef.current = continuationRunId;
      runStateRevisionRef.current += 1;
      setIsStreaming(true);
      try {
        const stream = await controller.streamRunEvents(
          userId,
          continuationRunId,
          undefined,
          abort.signal,
        );
        await parseSseStream(
          stream,
          abort.signal,
          {
            onChunk: (_runId, chunk) =>
              updateActiveMessage((last) => ({ ...last, content: last.content + chunk })),
            onCompletedResponse: (_runId, responseText) => {
              const runError = runErrorFromEvent('tool_result', { content: responseText });
              updateActiveMessage((last) =>
                runError
                  ? { ...last, content: '', runFailed: true, runError }
                  : { ...last, content: responseText },
              );
            },
            onReasoning: (_runId, chunk) =>
              updateActiveMessage((last) => ({
                ...last,
                reasoning: (last.reasoning ?? '') + chunk,
              })),
            onToolEvent: (toolEvent) => {
              updateActiveMessage((last) => ({
                ...last,
                toolActivity: applyToolEvent(last.toolActivity ?? [], toolEvent, last.content),
              }));
            },
            onEvent: (_runId, event, seq) => appendActiveEvent(continuationRunId, event, seq),
            onTokenUsage: (_runId, delta) => options.onTokenUsage?.(delta),
            onContextUsagePct: (_runId, pct) => options.onContextUsagePct?.(pct),
            onAwaitingApproval: (_runId, request) => {
              setIsStreaming(false);
              updateActiveMessage((last) => ({
                ...last,
                runAwaitingApproval: true,
                awaitingApproval: request,
              }));
              options.onRunFinished?.('awaiting_approval');
            },
            onWorkspaceChanged: (_runId, changes) =>
              options.onWorkspaceChanged?.(changes, store.roomId),
            onRunFinished: (_runId, status) => {
              activeRunIdRef.current = null;
              runStateRevisionRef.current += 1;
              if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                const registeredRunId = registeredRunIdRef.current;
                registeredRunIdRef.current = null;
                if (registeredRunId !== null && store.roomId !== null)
                  void controller
                    .closeRunRegistration?.(store.roomId, registeredRunId)
                    .catch(() => undefined);
              }
              setIsStreaming(false);
              if (status === 'failed')
                updateActiveMessage((last) => ({
                  ...last,
                  runFailed: true,
                  runError: last.runError ?? toFriendlyRunError(undefined),
                }));
              if (status === 'completed')
                updateActiveMessage((last) =>
                  hasAssistantOutput(last)
                    ? last
                    : {
                        ...last,
                        runFailed: true,
                        runError: last.runError ?? toFriendlyRunError(undefined),
                      },
                );
              options.onRunFinished?.(status);
            },
          },
          continuationRunId,
        );
        if (!abort.signal.aborted) setIsStreaming(false);
      } catch (errorValue: unknown) {
        if (abort.signal.aborted) return;
        activeRunIdRef.current = null;
        runStateRevisionRef.current += 1;
        setIsStreaming(false);
        const rawError = errorValue instanceof Error ? errorValue.message : errorValue;
        const runError = toFriendlyRunError(rawError);
        const structured = shouldShowStructuredRunError(rawError);
        setError(
          structured
            ? (runError.message ?? errorFallbackMessage ?? 'Something went wrong.')
            : typeof rawError === 'string'
              ? rawError
              : (errorFallbackMessage ?? 'Something went wrong.'),
        );
        updateActiveMessage((last) => ({
          ...last,
          runFailed: true,
          ...(structured ? { runError } : {}),
        }));
      }
    },
    [
      appendActiveEvent,
      controller,
      errorFallbackMessage,
      options,
      reconnect,
      store,
      updateActiveMessage,
      userId,
    ],
  );

  const reportBlockFailure = useCallback(
    (failure: unknown) => {
      const status = messageBlockFailureStatus(failure);
      if (status === 401) {
        window.location.assign('/login');
      }
      if (messageBlockSubscriptionRef.current) messageBlockSubscriptionRef.current.state = 'failed';
      setMessageBlockStreamStatus('failed');
      setStreamStatus('disconnected');
      const capacity = status === 429;
      const oversized = failure instanceof Error && failure.message === 'FRAME_TOO_LARGE';
      setError(
        capacity
          ? t('chat.streamCapacity')
          : oversized
            ? t('chat.streamOversized')
            : t('chat.streamFailed'),
      );
    },
    [t],
  );

  const restoreRoomState = useCallback(
    async (roomId: string, generation: number) => {
      const runRevision = runStateRevisionRef.current;
      const sessionState =
        typeof controller.getSessionState === 'function'
          ? agentName === undefined
            ? controller.getSessionState(userId, roomId)
            : controller.getSessionState(userId, roomId, agentName)
          : (agentName === undefined
              ? controller.getSessionTranscript(userId, roomId)
              : controller.getSessionTranscript(userId, roomId, agentName)
            ).then((transcript) => ({ transcript, pendingQuestion: null, pendingApproval: null }));
      const roomHistory = controller.getRoomHistory
        ? controller.getRoomHistory(userId, roomId)
        : Promise.resolve([]);
      return Promise.all([sessionState, roomHistory]).then(([state, runs]) => {
        if (generation !== conversationGenerationRef.current) return;
        // A snapshot requested before a send/approval/run event cannot replace
        // the newer run observation, even if the run changed and finished again.
        if (runRevision !== runStateRevisionRef.current)
          return (
            activeRunIdRef.current !== null ||
            latestStoreRef.current.messages.some(
              (message) =>
                message.runAwaitingInput ||
                message.runAwaitingApproval ||
                ('runAwaitingPlan' in message && message.runAwaitingPlan),
            )
          );
        const running = runs.find((run) =>
          ['running', 'pending', 'queued', 'awaiting_approval', 'awaiting_input'].includes(
            run.status,
          ),
        );
        if (controller.getRoomHistory) {
          activeRunIdRef.current = running?.runId ?? state.pendingApproval?.runId ?? null;
          runStateRevisionRef.current += 1;
        }
        store.setMessages((prev) => {
          if (generation !== conversationGenerationRef.current) return prev;
          const transcript = mergeTranscriptMessages(
            { id: roomKey, messages: prev },
            state.transcript,
          );
          const messages = hydrateChatRunHistory(transcript, runs);
          if (state.pendingApproval) {
            const alreadyPresent = messages.some(
              (message) =>
                message.awaitingApproval?.approvalId === state.pendingApproval?.approvalId &&
                message.runAwaitingApproval,
            );
            if (alreadyPresent) return messages;
            return [
              ...messages,
              {
                id: `${roomKey}-pending-approval`,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                runId: state.pendingApproval.runId,
                runAwaitingApproval: true,
                awaitingApproval: state.pendingApproval,
              },
            ];
          }
          if (state.pendingPlan) {
            const alreadyPresent = messages.some(
              (message) => Boolean(message.runAwaitingPlan),
            );
            if (alreadyPresent) return messages;
            return [
              ...messages,
              {
                id: `${roomKey}-pending-plan`,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                runAwaitingPlan: true,
                awaitingPlan: state.pendingPlan,
              },
            ];
          }
          if (state.pendingQuestion === null) return messages;
          const alreadyPresent = messages.some(
            (message) =>
              message.awaitingInput?.question === state.pendingQuestion?.question &&
              message.runAwaitingInput,
          );
          if (alreadyPresent) return messages;
          return [
            ...messages,
            {
              id: `${roomKey}-pending-question`,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              runAwaitingInput: true,
              awaitingInput: state.pendingQuestion,
            },
          ];
        });
        return Boolean(
          running ||
            state.pendingApproval ||
            state.pendingQuestion ||
            state.pendingPlan ||
            activeRunIdRef.current,
        );
      });
    },
    [controller, agentName, userId, store, roomKey],
  );

  const appendMessageBlock = useCallback(
    (block: MessageBlockViewModel, queueWhenMissing = true) => {
      const generation = conversationGenerationRef.current;
      store.setMessages((prev) => {
        if (generation !== conversationGenerationRef.current) return prev;
        const msgs = [...prev];
        const targetIdx = block.runId
          ? msgs.findIndex((m) => m.runId === block.runId)
          : msgs.length - 1;
        const target = targetIdx >= 0 ? msgs[targetIdx] : undefined;
        if (!target) {
          if (queueWhenMissing && block.runId) {
            const pending = pendingMessageBlocksRef.current.get(block.runId) ?? [];
            if (!pending.some((candidate) => candidate.id === block.id)) {
              pendingMessageBlocksRef.current.set(block.runId, [...pending, block]);
            }
          }
          return prev;
        }
        if (target.messageBlocks?.some((candidate) => candidate.id === block.id)) return prev;
        msgs[targetIdx] = {
          ...target,
          messageBlocks: [...(target.messageBlocks ?? []), block],
        };
        return msgs;
      });
    },
    [store],
  );

  // All restoration triggers share a projection read. Transport retries remain
  // owned by the subscription, so restoring cannot reset its failure budget.
  const restoreMessageBlockProjection = useCallback(
    async (
      roomId: string,
      generation: number,
      refreshState: boolean,
      reset = false,
    ): Promise<MessageBlockRecoveryResult> => {
      if (generation !== conversationGenerationRef.current) return { resume: false };
      const pending = projectionRestorationRef.current;
      if (pending?.roomId === roomId && pending.generation === generation) {
        // Escalate the same operation to a full replay. Focus and send must
        // await that replay too, rather than an earlier incremental result.
        if (reset) pending.reset = true;
        return pending.promise;
      }
      const restoration = {
        roomId,
        generation,
        reset,
        promise: Promise.resolve<MessageBlockRecoveryResult>({ resume: false }),
      };
      const operation = (async (): Promise<MessageBlockRecoveryResult> => {
        if (reset && blockCursorRef.current?.roomId === roomId) blockCursorRef.current = { roomId };
        let resume = refreshState ? Boolean(await restoreRoomState(roomId, generation)) : true;
        if (generation !== conversationGenerationRef.current) return { resume: false };
        let reloadedInvalidCursor = false;
        let replayReset = reset;
        if (restoration.reset && !replayReset) {
          replayReset = true;
          blockCursorRef.current = { roomId };
          if (!refreshState) resume = Boolean(await restoreRoomState(roomId, generation));
        }

        let lastBlockId =
          blockCursorRef.current?.roomId === roomId ? blockCursorRef.current.id : undefined;
        const history: MessageBlockViewModel[] = [];
        while (true) {
          if (generation !== conversationGenerationRef.current) return { resume: false };
          let page: readonly MessageBlockViewModel[];
          try {
            page =
              lastBlockId === undefined
                ? await listMessageBlockHistory(roomId)
                : await listMessageBlockHistory(roomId, lastBlockId);
          } catch (failure) {
            if (
              !(failure instanceof MessageBlockCursorInvalidError) ||
              lastBlockId === undefined ||
              reloadedInvalidCursor
            )
              throw failure;
            reloadedInvalidCursor = true;
            lastBlockId = undefined;
            history.length = 0;
            if (generation !== conversationGenerationRef.current)
              return { cursor: undefined, resume: false };
            blockCursorRef.current = { roomId };
            resume = Boolean(await restoreRoomState(roomId, generation));
            continue;
          }
          if (generation !== conversationGenerationRef.current)
            return { cursor: undefined, resume: false };
          if (restoration.reset && !replayReset) {
            replayReset = true;
            history.length = 0;
            lastBlockId = undefined;
            blockCursorRef.current = { roomId };
            if (!refreshState) resume = Boolean(await restoreRoomState(roomId, generation));
            continue;
          }
          history.push(...page);
          const next = page.at(-1)?.id;
          if (!next || next === lastBlockId) break;
          lastBlockId = next;
          if (page.length < 50) break;
        }
        if (generation !== conversationGenerationRef.current)
          return { cursor: undefined, resume: false };
        // A block names its run; a message restored from the agent's transcript
        // does not. Everything that cannot be placed used to go into
        // `pendingMessageBlocksRef` and stay there, which is why a reload came
        // back with the conversation's text and none of its charts.
        const { attach, restored } = splitRestoredBlocks(store.messages, history);
        attach.forEach((block) => appendMessageBlock(block));
        if (restored.length > 0) {
          store.setMessages((messages) => {
            if (generation !== conversationGenerationRef.current) return messages;
            let assistantIndex = -1;
            for (let index = messages.length - 1; index >= 0; index -= 1) {
              const candidate = messages[index];
              // Never assign unmatched old artifacts to the optimistic empty
              // assistant created by a send that is waiting for restoration.
              if (candidate?.role === 'assistant' && hasAssistantOutput(candidate)) {
                assistantIndex = index;
                break;
              }
            }
            const assistant = messages[assistantIndex];
            if (assistantIndex < 0 || assistant?.role !== 'assistant') return messages;
            const existing = assistant.messageBlocks ?? [];
            const added = restored.filter(
              (block) => !existing.some((candidate) => candidate.id === block.id),
            );
            if (added.length === 0) return messages;
            const next = [...messages];
            next[assistantIndex] = { ...assistant, messageBlocks: [...existing, ...added] };
            return next;
          });
        }
        setRestoredArtifacts((current) =>
          generation === conversationGenerationRef.current
            ? mergeRestoredBlocks(current, restored)
            : current,
        );
        blockCursorRef.current = { roomId, id: lastBlockId };

        return { cursor: lastBlockId, resume: resume || activeRunIdRef.current !== null };
      })();
      restoration.promise = operation;
      projectionRestorationRef.current = restoration;
      try {
        return await operation;
      } finally {
        if (projectionRestorationRef.current?.promise === operation)
          projectionRestorationRef.current = null;
      }
    },
    [appendMessageBlock, listMessageBlockHistory, restoreRoomState, store],
  );

  const openMessageBlockChannel = useCallback(
    async (roomId: string, restore = false) => {
      const generation = conversationGenerationRef.current;
      const pending = blockRestorationRef.current;
      if (pending?.roomId === roomId && pending.generation === generation) return pending.promise;
      const projection = projectionRestorationRef.current;
      if (projection?.roomId === roomId && projection.generation === generation)
        await projection.promise;
      if (generation !== conversationGenerationRef.current) return;
      const existing = messageBlockSubscriptionRef.current;
      if (existing?.roomId === roomId && !['paused', 'failed'].includes(existing.state)) return;
      const operation = (async () => {
        messageBlockSubscriptionRef.current?.close('replacement');
        messageBlockSubscriptionRef.current = {
          roomId,
          state: 'reconnecting',
          close: () => undefined,
        };
        setMessageBlockStreamStatus('reconnecting');
        const restored = await restoreMessageBlockProjection(roomId, generation, restore);
        const lastBlockId = restored.cursor;

        if (generation !== conversationGenerationRef.current) return;

        if (restore && restored.resume) void openPersistentStream(roomId, true);
        const handlers: SubscribeMessageBlocksControllerHandlers = {
          onBlock: (block) => {
            if (generation !== conversationGenerationRef.current) return;
            appendMessageBlock(block);
            blockCursorRef.current = { roomId, id: block.id };
          },
          recover: async (reason) => {
            const restored = await restoreMessageBlockProjection(
              roomId,
              generation,
              true,
              reason === 'cursor_reset',
            );
            if (generation !== conversationGenerationRef.current) return { resume: false };
            if (restored.resume) void openPersistentStream(roomId, true);
            return restored;
          },
          shouldReconnect: () =>
            activeRunIdRef.current !== null ||
            latestStoreRef.current.messages.some(
              (message) =>
                message.runAwaitingInput ||
                message.runAwaitingApproval ||
                ('runAwaitingPlan' in message && message.runAwaitingPlan),
            ),
          onStateChange: (state) => {
            if (generation !== conversationGenerationRef.current) return;
            const current = messageBlockSubscriptionRef.current;
            if (current?.roomId !== roomId) return;
            current.state = state;
            setMessageBlockStreamStatus(state);
          },
          onError: (failure) => {
            if (generation === conversationGenerationRef.current) reportBlockFailure(failure);
          },
        };
        const subscription = subscribeMessageBlocks(roomId, handlers, lastBlockId);
        if (messageBlockSubscriptionRef.current?.roomId === roomId) {
          messageBlockSubscriptionRef.current = {
            roomId,
            state: messageBlockSubscriptionRef.current.state,
            close: subscription.close,
          };
        } else {
          subscription.close('replacement');
        }
      })();
      blockRestorationRef.current = { roomId, generation, promise: operation };
      try {
        await operation;
      } finally {
        if (blockRestorationRef.current?.promise === operation) blockRestorationRef.current = null;
      }
    },
    [
      subscribeMessageBlocks,
      restoreMessageBlockProjection,
      appendMessageBlock,
      openPersistentStream,
      reportBlockFailure,
    ],
  );

  useEffect(() => {
    const identityChanged = previousConversationIdentityRef.current !== conversationIdentity;
    previousConversationIdentityRef.current = conversationIdentity;
    const roomChanged =
      previousSelectedRoomRef.current !== null && previousSelectedRoomRef.current !== store.roomId;
    previousSelectedRoomRef.current = store.roomId;

    if (identityChanged || roomChanged) {
      disconnect();
      if (identityChanged && !preserveStoreOnConversationChange) {
        store.setMessages(() => []);
        store.setRoomId(null);
        return;
      }
    }

    const roomId = store.roomId;
    if (!roomId) return;
    const generation = conversationGenerationRef.current;
    void openPersistentStream(roomId);

    // The shared operation restores authoritative state before block history.
    // Focus/send/reset races join this same operation during initial loading.
    void openMessageBlockChannel(roomId, true).catch((failure: unknown) => {
      if (generation === conversationGenerationRef.current) reportBlockFailure(failure);
    });
    // Key on the room and conversation identity, not on `store` (whose
    // identity is stable per caller but not memoized across renders in every
    // adapter) — re-running this per keystroke would re-fetch the transcript.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is intentionally keyed by its room id and conversation identity.
  }, [conversationIdentity, disconnect, preserveStoreOnConversationChange, store.roomId]);

  useEffect(
    () => () => {
      conversationGenerationRef.current += 1;
      messageBlockSubscriptionRef.current?.close('unmount');
      messageBlockSubscriptionRef.current = null;
    },
    [],
  );

  const resumeMessageBlocks = useCallback(
    async (retryFailed = false) => {
      const roomId = latestStoreRef.current.roomId;
      if (!roomId || (!retryFailed && messageBlockSubscriptionRef.current?.state === 'failed'))
        return;
      const generation = conversationGenerationRef.current;
      const pending = projectionRestorationRef.current;
      if (pending?.roomId === roomId && pending.generation === generation) await pending.promise;
      else if (messageBlockSubscriptionRef.current?.state === 'reconnecting')
        await restoreMessageBlockProjection(roomId, generation, true);
      if (generation === conversationGenerationRef.current)
        await openMessageBlockChannel(roomId, true);
    },
    [openMessageBlockChannel, restoreMessageBlockProjection],
  );

  useEffect(() => {
    resumeBlocksRef.current = resumeMessageBlocks;
  }, [resumeMessageBlocks]);
  useEffect(() => {
    const resume = () => {
      void resumeBlocksRef.current().catch(reportBlockFailure);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') resume();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reportBlockFailure]);

  const send = useCallback(
    /**
     * `replaceAssistantId` regenerates: the question already on screen stays,
     * and the answer under it starts over in place — same id, so the row is
     * not rebuilt — instead of the question being asked a second time. The
     * answer may span several assistant messages (a reopened conversation
     * holds each model turn as its own); everything from that id on is the
     * answer being replaced.
     */
    async (text: string, displayText?: string, replaceAssistantId?: string) => {
      if (!text.trim() || isStreaming) return;
      setError(null);
      const generation = conversationGenerationRef.current;

      const assistantMessage: DisplayMessage = {
        id: replaceAssistantId ?? crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        toolActivity: [],
      };
      if (replaceAssistantId === undefined) {
        const userMessage: DisplayMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: displayText ?? text,
          timestamp: new Date().toISOString(),
        };
        store.setMessages((prev) => [...prev, userMessage, assistantMessage]);
      } else {
        store.setMessages((prev) => {
          const from = prev.findIndex((message) => message.id === replaceAssistantId);
          return from === -1 ? prev : [...prev.slice(0, from), assistantMessage];
        });
      }
      setIsStreaming(true);

      try {
        if (
          blockRestorationRef.current ||
          projectionRestorationRef.current ||
          ['paused', 'failed', 'reconnecting'].includes(
            messageBlockSubscriptionRef.current?.state ?? 'connected',
          )
        )
          await resumeMessageBlocks(true);
        if (generation !== conversationGenerationRef.current) return;
        const result = await controller.sendMessage({
          userId,
          roomId: store.roomId,
          message: text,
          sessionKey: roomKey,
          ...(agentName === undefined ? {} : { agent: agentName }),
          ...(store.roomId === null ? { title: title ?? text.slice(0, 60) } : {}),
          ...(dataScope === undefined ? {} : { dataScope }),
          ...(plantModelScope === undefined ? {} : { plantModelScope }),
        });

        // A scoped panel can switch rooms while the old request is in flight.
        // Its result must not attach the old run or room to the new store.
        if (generation !== conversationGenerationRef.current) {
          // The accepted run outlives this view. Revoking its Core scope here would
          // interrupt its tools merely because the user selected another room.
          return;
        }

        activeRunIdRef.current = result.runId;

        runStateRevisionRef.current += 1;
        registeredRunIdRef.current = result.runId;
        store.setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== assistantMessage.id) return message;
            const pending = pendingMessageBlocksRef.current.get(result.runId) ?? [];
            pendingMessageBlocksRef.current.delete(result.runId);
            const messageBlocks = [...(message.messageBlocks ?? [])];
            for (const block of pending) {
              if (!messageBlocks.some((candidate) => candidate.id === block.id))
                messageBlocks.push(block);
            }
            return {
              ...message,
              runId: result.runId,
              ...(messageBlocks.length === 0 ? {} : { messageBlocks }),
            };
          }),
        );
        if (store.roomId === null) {
          store.setRoomId(result.roomId);
        }
        const activeRoomId = store.roomId ?? result.roomId;
        // The room stream snapshots its run ids when it connects. Reopen it
        // after every accepted run so a later turn enters the stream even
        // when the previous room connection is still alive or reconnecting.
        void openPersistentStream(activeRoomId, true);
        void openMessageBlockChannel(activeRoomId).catch(reportBlockFailure);
      } catch (err: unknown) {
        if (generation !== conversationGenerationRef.current) return;
        const rawError = err instanceof Error ? err.message : err;
        const runError = toFriendlyRunError(rawError);
        const structured = shouldShowStructuredRunError(rawError);
        setError(
          structured
            ? (runError.message ?? errorFallbackMessage ?? 'Something went wrong.')
            : typeof rawError === 'string'
              ? rawError
              : (errorFallbackMessage ?? 'Something went wrong.'),
        );
        setIsStreaming(false);
        store.setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, runFailed: true, ...(structured ? { runError } : {}) }
              : m,
          ),
        );
      }
    },
    [
      agentName,
      plantModelScope,
      controller,
      dataScope,
      errorFallbackMessage,
      isStreaming,
      openMessageBlockChannel,
      openPersistentStream,
      resumeMessageBlocks,
      reportBlockFailure,
      roomKey,
      store,
      title,
      userId,
    ],
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  /**
   * Asks for the newest answer again, in place. Only the newest: an older
   * answer has replies built on it, and the agent's own history would still
   * carry both versions of everything after it.
   */
  const regenerate = useCallback(
    (assistantMessageId: string) => {
      const messages = store.messages;
      const index = messages.findIndex((message) => message.id === assistantMessageId);
      if (index <= 0 || messages[index]?.role !== 'assistant') return;
      // Only the newest answer: nothing but assistant messages may follow.
      if (messages.slice(index + 1).some((message) => message.role !== 'assistant')) return;
      let questionIndex = index - 1;
      while (questionIndex >= 0 && messages[questionIndex]?.role !== 'user') questionIndex -= 1;
      const question = messages[questionIndex];
      if (question === undefined) return;
      // The whole answer starts over, from its first message after the question.
      const first = messages[questionIndex + 1];
      if (first !== undefined) void send(question.content, undefined, first.id);
    },
    [send, store],
  );

  useEffect(
    () => () => {
      persistentAbortRef.current?.abort();
      approvalAbortRef.current?.abort();
    },
    [],
  );

  return {
    isStreaming,
    error,
    restoredArtifacts,
    streamStatus: messageBlockStreamStatus === 'failed' ? 'disconnected' : streamStatus,
    messageBlockStreamStatus,
    send,
    regenerate,
    reconnect,
    disconnect,
    decideApproval,
  };
}
