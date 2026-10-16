// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatConversation } from '@/app/_components/chat/use-chat-conversation';
import type { DisplayMessage } from '@/app/_components/chat/types';

function fakeStore(initial: readonly DisplayMessage[] = []) {
  let messages = initial;
  let roomId: string | null = null;
  return {
    get messages() {
      return messages;
    },
    get roomId() {
      return roomId;
    },
    setMessages: vi.fn((updater: (m: readonly DisplayMessage[]) => readonly DisplayMessage[]) => {
      messages = updater(messages);
    }),
    setRoomId: vi.fn((id: string | null) => {
      roomId = id;
    }),
  };
}

function fakeMessageBlockControllers() {
  return {
    listMessageBlockHistory: vi.fn().mockResolvedValue([]),
    subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
  };
}

describe('useChatConversation — send + room bootstrap', () => {
  it('creates the room on the first send, with the given agent and roomKey', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('add a step');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        roomId: null,
        message: 'add a step',
        sessionKey: 'workflow-wf-1',
        agent: 'automation-workflow-editor',
      }),
    );
    expect(store.setRoomId).toHaveBeenCalledWith('room-1');
    expect(store.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('reuses the existing roomId on a second send instead of recreating the room', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-2',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore();
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('remove that step');
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room-1' }));
  });

  it('carries dataScope onto every send when configured', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
        dataScope: { schema: 'demo' },
      }),
    );

    await act(async () => {
      await result.current.send('hello');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ dataScope: { schema: 'demo' } }),
    );
  });

  it('marks the run failed on a send error, without throwing', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('network down'));
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('add a step');
    });

    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(store.messages.at(-1)?.runFailed).toBe(true);
    expect(result.current.isStreaming).toBe(false);
  });
});

// Each frame is enqueued on its own macrotask, matching chat-screen.test.ts's
// `streamOf` helper — real SSE frames arrive as discrete network reads, not
// one joined chunk.
function sseStreamOf(frames: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const frame of frames) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        controller.enqueue(new TextEncoder().encode(frame));
      }
      controller.close();
    },
  });
}

function heldSseStreamOf(frames: readonly string[]): {
  readonly stream: ReadableStream<Uint8Array>;
  readonly close: () => void;
} {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
    },
  });
  return {
    stream,
    close: () => streamController?.close(),
  };
}

describe('useChatConversation — SSE stream', () => {
  it('reopens the room stream when a later turn is added to the same room', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        runId: 'run-1',
        roomId: 'room-1',
        roomEventsUrl: '/events',
        queuePosition: 0,
      })
      .mockResolvedValueOnce({
        runId: 'run-2',
        roomId: 'room-1',
        roomEventsUrl: '/events',
        queuePosition: 0,
      });
    const firstStream = heldSseStreamOf([
      `event: run_finished\ndata: ${JSON.stringify({ run_id: 'run-1', status: 'completed' })}\n\n`,
    ]);
    const streamEvents = vi
      .fn()
      .mockResolvedValueOnce(firstStream.stream)
      .mockResolvedValueOnce(
        sseStreamOf([
          `event: text\ndata: ${JSON.stringify({ run_id: 'run-2', data: 'second response' })}\n\n`,
          `event: run_finished\ndata: ${JSON.stringify({ run_id: 'run-2', status: 'completed' })}\n\n`,
        ]),
      );
    const store = fakeStore();
    const { result, unmount } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('first');
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    await act(async () => {
      await result.current.send('second');
    });
    await waitFor(() => expect(streamEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(store.messages.at(-1)?.content).toBe('second response'));

    firstStream.close();
    unmount();
  });

  it('restores a durable pending question when reopening a room', async () => {
    const store = fakeStore();
    store.setRoomId('room-1');
    const getSessionState = vi.fn().mockResolvedValue({
      transcript: [{ role: 'user', content: 'Create a report', reasoning: null }],
      pendingQuestion: {
        question: 'Which format?',
        options: [{ label: 'Markdown', description: null }],
        allowOther: false,
      },
    });

    renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          getSessionState,
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await waitFor(() => {
      expect(store.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: '',
        runAwaitingInput: true,
        awaitingInput: {
          question: 'Which format?',
          options: [{ label: 'Markdown', description: null }],
          allowOther: false,
        },
      });
    });
    expect(getSessionState).toHaveBeenCalledWith('user-1', 'room-1', 'automation-workflow-editor');
  });

  it('appends streamed chunks onto the active assistant message', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi.fn().mockResolvedValue(
      sseStreamOf([
        `event: text\ndata: ${JSON.stringify({ run_id: 'run-1', data: 'Added the ' })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          run_id: 'run-1',
          data: { response_text: 'Added the step.' },
        })}\n\n`,
        `event: run_finished\ndata: ${JSON.stringify({ run_id: 'run-1', status: 'completed' })}\n\n`,
      ]),
    );
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('add a step');
    });
    await waitFor(() => expect(store.messages.at(-1)?.content).toBe('Added the step.'));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('surfaces an agent approval request and pauses the composer', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi.fn().mockResolvedValue(
      sseStreamOf([
        `event: awaiting_approval\ndata: ${JSON.stringify({
          run_id: 'run-1',
          data: {
            approval_id: 'approval-1',
            action: 'document.create',
            preview: 'Create report.md',
            expires_at: '2026-09-16T10:00:00.000Z',
          },
        })}\n\n`,
      ]),
    );
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'chat-assistant',
        roomKey: 'chat-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('create report.md');
    });

    await waitFor(() =>
      expect(store.messages.at(-1)).toMatchObject({
        runId: 'run-1',
        runAwaitingApproval: true,
        awaitingApproval: {
          approvalId: 'approval-1',
          action: 'document.create',
          preview: 'Create report.md',
          expiresAt: '2026-09-16T10:00:00.000Z',
        },
      }),
    );
    expect(result.current.isStreaming).toBe(false);
  });

  it('keeps a new approval on its own run when a stale paused turn is restored after it', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-current',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore();
    const stalePausedTurn: DisplayMessage = {
      id: 'assistant-stale',
      role: 'assistant',
      content: '',
      timestamp: '2026-09-17T07:20:00.000Z',
      runId: 'run-stale',
      runAwaitingApproval: true,
      awaitingApproval: {
        approvalId: 'approval-stale',
        action: 'mcp__skill__list_skills',
        preview: 'List skills',
        expiresAt: '2026-09-17T07:25:00.000Z',
      },
    };
    const streamEvents = vi.fn().mockImplementation(async () => {
      // Room-history hydration can finish after the new empty assistant turn
      // was created but before its next SSE event is handled.
      store.setMessages((messages) => [...messages, stalePausedTurn]);
      return sseStreamOf([
        `event: awaiting_approval\ndata: ${JSON.stringify({
          run_id: 'run-current',
          data: {
            approval_id: 'approval-current',
            action: 'mcp__skill__create_skill',
            preview: 'Create a data exploration skill',
            expires_at: '2026-09-17T08:00:00.000Z',
          },
        })}\n\n`,
      ]);
    });
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'skill-creator',
        roomKey: 'skill-creator',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('create a data exploration skill');
    });

    await waitFor(() =>
      expect(store.messages.find((message) => message.runId === 'run-current')).toMatchObject({
        runAwaitingApproval: true,
        awaitingApproval: { approvalId: 'approval-current' },
      }),
    );
    expect(store.messages.find((message) => message.runId === 'run-stale')).toMatchObject({
      awaitingApproval: { approvalId: 'approval-stale' },
    });
  });

  it('surfaces a second approval requested by an approved continuation', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi.fn().mockResolvedValue(
      sseStreamOf([
        `event: awaiting_approval\ndata: ${JSON.stringify({
          run_id: 'run-1',
          data: {
            approval_id: 'approval-1',
            action: 'mcp__trino__profile_table',
            preview: 'Profile orders',
            expires_at: '2026-09-17T08:00:00.000Z',
          },
        })}\n\n`,
      ]),
    );
    const streamRunEvents = vi.fn().mockResolvedValue(
      sseStreamOf([
        `event: awaiting_approval\ndata: ${JSON.stringify({
          run_id: 'run-2',
          data: {
            approval_id: 'approval-2',
            action: 'mcp__chart__preview_chart',
            preview: 'Preview revenue chart',
            expires_at: '2026-09-17T08:00:00.000Z',
          },
        })}\n\n`,
      ]),
    );
    const decideRunApproval = vi.fn().mockResolvedValue({
      continuationRunId: 'run-2',
      id: 'approval-1',
      toolCallId: 'call-1',
      action: 'mcp__trino__profile_table',
      argumentsHash: 'hash-1',
      preview: 'Profile orders',
      status: 'approved',
      createdAt: '2026-09-17T07:00:00.000Z',
      expiresAt: '2026-09-17T08:00:00.000Z',
    });
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'chat-assistant',
        roomKey: 'chat-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          streamRunEvents,
          decideRunApproval,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('show revenue for the last 12 months');
    });
    await waitFor(() =>
      expect(store.messages.at(-1)?.awaitingApproval?.approvalId).toBe('approval-1'),
    );

    await act(async () => {
      await result.current.decideApproval('run-1', 'approval-1', 'approved');
    });

    await waitFor(() =>
      expect(store.messages.at(-1)).toMatchObject({
        runId: 'run-2',
        runAwaitingApproval: true,
        awaitingApproval: {
          approvalId: 'approval-2',
          action: 'mcp__chart__preview_chart',
          preview: 'Preview revenue chart',
        },
      }),
    );
    expect(result.current.isStreaming).toBe(false);
  });

  it('calls onRunFinished with the terminal status', async () => {
    const onRunFinished = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi
      .fn()
      .mockResolvedValue(
        sseStreamOf([
          `event: run_finished\ndata: ${JSON.stringify({ run_id: 'run-1', status: 'completed' })}\n\n`,
        ]),
      );
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
        onRunFinished,
      }),
    );

    await act(async () => {
      await result.current.send('add a step');
    });
    await waitFor(() => expect(onRunFinished).toHaveBeenCalledWith('completed'));
  });

  it('marks a completed run with no assistant output as failed instead of leaving a blank bubble', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi
      .fn()
      .mockResolvedValue(
        sseStreamOf([
          `event: run_finished\ndata: ${JSON.stringify({ run_id: 'run-1', status: 'completed' })}\n\n`,
        ]),
      );
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'skill-creator',
        roomKey: 'skill-creator',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      await result.current.send('hello');
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(store.messages.at(-1)).toMatchObject({
      role: 'assistant',
      runId: 'run-1',
      runFailed: true,
    });
  });

  it('reports a completed workflow creation tool even without a run_finished event', async () => {
    const onToolFinished = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const streamEvents = vi.fn().mockResolvedValue(
      sseStreamOf([
        `event: tool_started\ndata: ${JSON.stringify({
          run_id: 'run-1',
          data: { id: 'tool-1', name: 'create_workflow', args: {} },
        })}\n\n`,
        `event: tool_finished\ndata: ${JSON.stringify({
          run_id: 'run-1',
          data: { id: 'tool-1', ok: true },
        })}\n\n`,
      ]),
    );
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'automation-workflow-list',
        userId: 'user-1',
        controller: {
          sendMessage,
          streamEvents,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
        onToolFinished,
      }),
    );

    await act(async () => {
      await result.current.send('create a daily workflow');
    });
    await waitFor(() => expect(onToolFinished).toHaveBeenCalledWith('create_workflow'));
  });
});

describe('useChatConversation — disconnect', () => {
  it('closes the message-block subscription and resets streaming state', async () => {
    const close = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-1',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const subscribeMessageBlocks = vi.fn().mockReturnValue({ close });
    const store = fakeStore();
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks,
        store,
      }),
    );

    await act(async () => {
      await result.current.send('add a step');
    });
    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());

    act(() => {
      result.current.disconnect();
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not restore an in-flight historical transcript after disconnect', async () => {
    let resolveSessionState:
      | ((state: {
          readonly transcript: readonly { role: 'user'; content: string; reasoning: null }[];
          readonly pendingQuestion: null;
        }) => void)
      | undefined;
    const getSessionState = vi.fn().mockImplementation(
      () =>
        new Promise<{
          readonly transcript: readonly { role: 'user'; content: string; reasoning: null }[];
          readonly pendingQuestion: null;
        }>((resolve) => {
          resolveSessionState = resolve;
        }),
    );
    const store = fakeStore();
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'plant-model-assistant',
        roomKey: 'plant-model-site-1',
        userId: 'user-1',
        controller: {
          sendMessage: vi.fn(),
          getSessionState,
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );
    await waitFor(() => expect(getSessionState).toHaveBeenCalled());

    act(() => result.current.disconnect());
    await act(async () => {
      resolveSessionState?.({
        transcript: [{ role: 'user', content: 'stale history', reasoning: null }],
        pendingQuestion: null,
      });
      await Promise.resolve();
    });

    expect(store.messages).toHaveLength(0);
  });
});

describe('useChatConversation — message-block channel + hydration', () => {
  it('keeps a block that arrives before the send response supplies its run ID', async () => {
    let resolveSend:
      | ((value: {
          readonly runId: string;
          readonly roomId: string;
          readonly roomEventsUrl: string;
          readonly queuePosition: number;
        }) => void)
      | undefined;
    const sendMessage = vi.fn().mockImplementation(
      () =>
        new Promise<{
          readonly runId: string;
          readonly roomId: string;
          readonly roomEventsUrl: string;
          readonly queuePosition: number;
        }>((resolve) => {
          resolveSend = resolve;
        }),
    );
    let onBlock:
      | ((block: {
          readonly id: string;
          readonly runId: string | null;
          readonly blockType: 'chart';
          readonly payload: Record<string, unknown>;
          readonly fallbackText: string;
        }) => void)
      | undefined;
    const store = fakeStore();
    store.setRoomId('room-1');

    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockImplementation((_roomId, handlers) => {
          onBlock = handlers.onBlock;
          return { close: vi.fn() };
        }),
        store,
      }),
    );

    await waitFor(() => expect(onBlock).toBeDefined());
    let send: Promise<void> | undefined;
    act(() => {
      send = result.current.send('add a step');
    });
    // Sending waits for any reconnect restoration before dispatching the new turn.
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    act(() => {
      onBlock?.({
        id: 'block-1',
        runId: 'run-1',
        blockType: 'chart',
        payload: {},
        fallbackText: 'Chart preview',
      });
    });
    act(() => {
      resolveSend?.({
        runId: 'run-1',
        roomId: 'room-1',
        roomEventsUrl: '/events',
        queuePosition: 0,
      });
    });
    await act(async () => {
      await send;
    });

    expect(store.messages.at(-1)?.messageBlocks).toEqual([
      expect.objectContaining({ id: 'block-1', runId: 'run-1' }),
    ]);
  });

  it('does not render the same message block twice when history and SSE overlap', async () => {
    let onBlock:
      | ((block: {
          readonly id: string;
          readonly runId: string | null;
          readonly blockType: 'chart';
          readonly payload: Record<string, unknown>;
          readonly fallbackText: string;
        }) => void)
      | undefined;
    const store = fakeStore();
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          sendMessage: vi.fn().mockResolvedValue({
            runId: 'run-1',
            roomId: 'room-1',
            roomEventsUrl: '/events',
            queuePosition: 0,
          }),
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockImplementation((_roomId, handlers) => {
          onBlock = handlers.onBlock;
          return { close: vi.fn() };
        }),
        store,
      }),
    );

    await waitFor(() => expect(onBlock).toBeDefined());
    await act(async () => {
      await result.current.send('add a step');
    });
    const block = {
      id: 'block-1',
      runId: 'run-1',
      blockType: 'chart' as const,
      payload: {},
      fallbackText: 'Chart preview',
    };
    act(() => {
      onBlock?.(block);
      onBlock?.(block);
    });

    expect(store.messages.at(-1)?.messageBlocks).toHaveLength(1);
  });

  it('backfills and recovers an existing room’s transcript on mount', async () => {
    const getSessionState = vi.fn().mockResolvedValue({
      transcript: [
        { role: 'user', content: 'add a step', reasoning: null },
        { role: 'assistant', content: 'Added it.', reasoning: null },
      ],
      pendingQuestion: null,
    });
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    const subscribeMessageBlocks = vi.fn().mockReturnValue({ close: vi.fn() });
    const store = fakeStore();
    store.setRoomId('room-1');

    renderHook(() =>
      useChatConversation({
        agentName: 'automation-workflow-editor',
        roomKey: 'workflow-wf-1',
        userId: 'user-1',
        controller: {
          getSessionState,
          sendMessage: vi.fn(),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        store,
      }),
    );

    await waitFor(() =>
      expect(store.messages.map((m) => m.content)).toEqual(['add a step', 'Added it.']),
    );
    expect(getSessionState).toHaveBeenCalledWith('user-1', 'room-1', 'automation-workflow-editor');
  });

  it('does not attach unmatched historical blocks to a new post-reset run', async () => {
    const staleBlock = {
      id: 'stale-block',
      runId: 'run-reused-by-fixture',
      blockType: 'chart' as const,
      payload: {},
      fallbackText: 'Old chart',
    };
    const store = fakeStore();
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'plant-model-assistant',
        roomKey: 'plant-model-site-1',
        userId: 'user-1',
        controller: {
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          sendMessage: vi.fn().mockResolvedValue({
            runId: 'run-reused-by-fixture',
            roomId: 'room-1',
            roomEventsUrl: '/events',
            queuePosition: 0,
          }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        listMessageBlockHistory: vi.fn().mockResolvedValue([staleBlock]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        store,
      }),
    );

    await waitFor(() => expect(store.messages).toHaveLength(0));
    await act(async () => {
      await result.current.send('fresh question');
    });

    expect(store.messages.at(-1)?.messageBlocks).toBeUndefined();
  });
});

describe('useChatConversation — regenerate', () => {
  /* Regenerating is asking for the answer again, not asking the question
     again: the question stays where it is and the answer under it starts
     over, keeping its id so the row is not rebuilt. */
  it('starts the newest answer over in place without re-sending the question', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-2',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore([
      { id: 'u1', role: 'user', content: 'How did production go?', timestamp: 't' },
      { id: 'a1', role: 'assistant', content: 'Up 4%.', timestamp: 't', runId: 'run-1' },
    ]);
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'chat-assistant',
        roomKey: 'room-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      result.current.regenerate('a1');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'How did production go?', roomId: 'room-1' }),
    );
    expect(store.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(store.messages[1]).toMatchObject({ role: 'assistant', content: '', runId: 'run-2' });
    expect(store.messages[1]?.toolActivity).toEqual([]);
  });

  /* A reopened conversation holds each model turn of an answer as its own
     message — the opening sentence, then the answer. Regenerating replaces
     all of them, or the old opening sentence would sit above the new answer. */
  it('replaces every message of the newest answer, keeping the first one in place', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      runId: 'run-2',
      roomId: 'room-1',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const store = fakeStore([
      { id: 'u1', role: 'user', content: 'Top 3?', timestamp: 't' },
      { id: 'a1', role: 'assistant', content: "I'll look it up.", timestamp: 't' },
      { id: 'a2', role: 'assistant', content: 'A, B, C.', timestamp: 't' },
    ]);
    store.setRoomId('room-1');
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'chat-assistant',
        roomKey: 'room-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      result.current.regenerate('a2');
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ message: 'Top 3?' }));
    expect(store.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(store.messages[1]).toMatchObject({ role: 'assistant', content: '', runId: 'run-2' });
  });

  it('ignores anything but the newest answer', async () => {
    const sendMessage = vi.fn();
    const store = fakeStore([
      { id: 'u1', role: 'user', content: 'One?', timestamp: 't' },
      { id: 'a1', role: 'assistant', content: 'One.', timestamp: 't' },
      { id: 'u2', role: 'user', content: 'Two?', timestamp: 't' },
      { id: 'a2', role: 'assistant', content: 'Two.', timestamp: 't' },
    ]);
    const { result } = renderHook(() =>
      useChatConversation({
        agentName: 'chat-assistant',
        roomKey: 'room-1',
        userId: 'user-1',
        controller: {
          sendMessage,
          getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
          streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
        } as never,
        ...fakeMessageBlockControllers(),
        store,
      }),
    );

    await act(async () => {
      result.current.regenerate('a1');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(store.messages[1]?.content).toBe('One.');
  });
});

describe('Message-block idle restoration', () => {
  it('coalesces focus, visibility and send after ten minutes; restores missed blocks before dispatch', async () => {
    const store = fakeStore([
      {
        id: 'assistant',
        role: 'assistant',
        content: 'Earlier answer',
        timestamp: '',
        runId: 'old-run',
      },
    ]);
    store.setRoomId('room-1');
    let handlers:
      | import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers
      | undefined;
    const close = vi.fn();
    const subscribe = vi.fn((_room: string, next: typeof handlers) => {
      handlers = next;
      return { close };
    });
    const state = { transcript: [], pendingQuestion: null };
    let finishRestore: ((value: typeof state) => void) | undefined;
    const getSessionState = vi
      .fn()
      .mockResolvedValueOnce(state)
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRestore = resolve;
          }),
      );
    const historyBlock = {
      id: 'first',
      runId: 'old-run',
      blockType: 'text' as const,
      payload: {},
      fallbackText: 'First',
    };
    const missed = { ...historyBlock, id: 'missed' };
    const history = vi.fn().mockResolvedValueOnce([historyBlock]).mockResolvedValue([missed]);
    const sendMessage = vi.fn().mockResolvedValue({
      roomId: 'room-1',
      runId: 'new-run',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const controller = {
      getSessionState,
      streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
      sendMessage,
    };
    const { result, unmount } = renderHook(() =>
      useChatConversation({
        userId: 'user',
        roomKey: 'key',
        controller: controller as never,
        store,
        listMessageBlockHistory: history,
        subscribeMessageBlocks: subscribe as never,
      }),
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    act(() => handlers?.onStateChange?.('paused'));
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    vi.useRealTimers();
    let sending: Promise<void> | undefined;
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      sending = result.current.send('new prompt');
    });
    expect(getSessionState).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
    await act(async () => {
      finishRestore?.(state);
      await sending;
    });
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenLastCalledWith('room-1', expect.any(Object), 'missed');
    expect(history).toHaveBeenLastCalledWith('room-1', 'first');
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      store.messages
        .find((message) => message.id === 'assistant')
        ?.messageBlocks?.map((block) => block.id),
    ).toEqual(['first', 'missed']);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'new prompt', roomId: 'room-1' }),
    );
    unmount();
  });

  it('keeps three tabs independent with separate rooms and cursors', async () => {
    const subscriptions: { room: string; cursor?: string; close: ReturnType<typeof vi.fn> }[] = [];
    const tabs = ['one', 'two', 'three'].map((room) => {
      const store = fakeStore();
      store.setRoomId(room);
      const controller = {
        getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
        streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
      };
      return renderHook(() =>
        useChatConversation({
          userId: 'same-user',
          roomKey: room,
          store,
          controller: controller as never,
          listMessageBlockHistory: vi.fn().mockResolvedValue([
            {
              id: `cursor-${room}`,
              runId: null,
              blockType: 'text',
              payload: {},
              fallbackText: room,
            },
          ]),
          subscribeMessageBlocks: ((id: string, _handlers: unknown, cursor?: string) => {
            const close = vi.fn();
            subscriptions.push({ room: id, cursor, close });
            return { close };
          }) as never,
        }),
      );
    });
    await waitFor(() => expect(subscriptions).toHaveLength(3));
    expect(subscriptions.map(({ room, cursor }) => ({ room, cursor }))).toEqual(
      ['one', 'two', 'three'].map((room) => ({ room, cursor: `cursor-${room}` })),
    );
    tabs[0]?.unmount();
    expect(subscriptions[0]?.close).toHaveBeenCalledTimes(1);
    expect(subscriptions[1]?.close).not.toHaveBeenCalled();
    expect(subscriptions[2]?.close).not.toHaveBeenCalled();
    tabs[1]?.unmount();
    tabs[2]?.unmount();
  });
});

it('does not revoke a durable run when a delayed accepted send returns after disconnection', async () => {
  const store = fakeStore();
  let accepted:
    | ((result: {
        roomId: string;
        runId: string;
        roomEventsUrl: string;
        queuePosition: number;
      }) => void)
    | undefined;
  const closeRunRegistration = vi.fn();
  const sendMessage = vi.fn(
    () =>
      new Promise((resolve) => {
        accepted = resolve;
      }),
  );
  const controller = {
    sendMessage,
    closeRunRegistration,
    streamEvents: vi.fn(),
    getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
  };
  const { result, unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'key',
      store,
      controller: controller as never,
      ...fakeMessageBlockControllers(),
    }),
  );
  let sending: Promise<void> | undefined;
  act(() => {
    sending = result.current.send('new prompt');
  });
  act(() => result.current.disconnect());
  await act(async () => {
    accepted?.({
      roomId: 'room',
      runId: 'durable-run',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    await sending;
  });
  expect(closeRunRegistration).not.toHaveBeenCalled();
  expect(controller.streamEvents).not.toHaveBeenCalled();
  expect(store.roomId).toBeNull();
  unmount();
});

describe('Message-block authoritative recovery', () => {
  it('coalesces reset, focus and send; reloads without the invalid cursor before sending once', async () => {
    const store = fakeStore();
    store.setRoomId('room-1');
    const blocks = fakeMessageBlockControllers();
    const state = { transcript: [], pendingQuestion: null, pendingApproval: null };
    let finish: ((value: typeof state) => void) | undefined;
    const getSessionState = vi
      .fn()
      .mockResolvedValueOnce(state)
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const sendMessage = vi.fn().mockResolvedValue({
      roomId: 'room-1',
      runId: 'new-run',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    const controller = {
      getSessionState,
      getRoomHistory: vi.fn().mockResolvedValue([]),
      sendMessage,
      streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
    };
    const { result, unmount } = renderHook(() =>
      useChatConversation({
        userId: 'user',
        roomKey: 'key',
        store,
        controller: controller as never,
        ...blocks,
      }),
    );
    await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1));
    const handlers = blocks.subscribeMessageBlocks.mock
      .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
    expect(handlers.recover).toBeTypeOf('function');
    let recovering: ReturnType<NonNullable<typeof handlers.recover>> | undefined;
    let sending: Promise<void> | undefined;
    act(() => {
      handlers.onStateChange?.('reconnecting');
      recovering = handlers.recover?.('cursor_reset', 'invalid');
      window.dispatchEvent(new Event('focus'));
      sending = result.current.send('one new turn');
    });
    expect(getSessionState).toHaveBeenCalledTimes(2);
    expect(sendMessage).not.toHaveBeenCalled();
    await act(async () => {
      finish?.(state);
      await recovering;
      await sending;
    });
    expect(blocks.listMessageBlockHistory).toHaveBeenLastCalledWith('room-1');
    expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('refreshes authoritative state on unexpected reconnect and pauses a completed run', async () => {
    const store = fakeStore();
    store.setRoomId('room-1');
    const blocks = fakeMessageBlockControllers();
    const controller = {
      getSessionState: vi
        .fn()
        .mockResolvedValue({ transcript: [], pendingQuestion: null, pendingApproval: null }),
      getRoomHistory: vi.fn().mockResolvedValue([]),
      streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
    };
    const { unmount } = renderHook(() =>
      useChatConversation({
        userId: 'user',
        roomKey: 'key',
        store,
        controller: controller as never,
        ...blocks,
      }),
    );
    await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1));
    const handlers = blocks.subscribeMessageBlocks.mock
      .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
    expect(handlers.recover).toBeTypeOf('function');
    let restored: unknown;
    await act(async () => {
      restored = await handlers.recover?.('transport_failure');
    });
    expect(restored).toEqual({ cursor: undefined, resume: false });
    expect(controller.getSessionState).toHaveBeenCalledTimes(2);
    unmount();
    expect(blocks.subscribeMessageBlocks.mock.results[0]?.value.close).toHaveBeenCalledWith(
      'unmount',
    );
  });
});

it('discards delayed reset restoration after a room switch without attaching to the new room', async () => {
  const store = fakeStore();
  store.setRoomId('room-1');
  const blocks = fakeMessageBlockControllers();
  const state = { transcript: [], pendingQuestion: null, pendingApproval: null };
  let finish: ((value: typeof state) => void) | undefined;
  const getSessionState = vi
    .fn()
    .mockResolvedValueOnce(state)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(state);
  const controller = {
    getSessionState,
    getRoomHistory: vi.fn().mockResolvedValue([]),
    streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
  };
  const { rerender, unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'key',
      store,
      controller: controller as never,
      ...blocks,
    }),
  );
  await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1));
  const old = blocks.subscribeMessageBlocks.mock
    .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
  let recovering: ReturnType<NonNullable<typeof old.recover>> | undefined;
  act(() => {
    recovering = old.recover?.('cursor_reset');
  });
  act(() => {
    store.setRoomId('room-2');
    rerender();
  });
  await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(2));
  let result: unknown;
  await act(async () => {
    finish?.(state);
    result = await recovering;
  });
  expect(result).toEqual({ resume: false });
  expect(blocks.subscribeMessageBlocks).toHaveBeenLastCalledWith(
    'room-2',
    expect.any(Object),
    undefined,
  );
  expect(blocks.listMessageBlockHistory.mock.calls.map(([room]) => room)).toEqual([
    'room-1',
    'room-2',
  ]);
  expect(blocks.subscribeMessageBlocks.mock.results[0]?.value.close).toHaveBeenCalledWith(
    'room_change',
  );
  unmount();
});

it('keeps three observers of the same pending run independent when one closes', async () => {
  const tabs = Array.from({ length: 3 }, () => {
    const store = fakeStore();
    store.setRoomId('shared-room');
    const blocks = fakeMessageBlockControllers();
    const controller = {
      getSessionState: vi.fn().mockResolvedValue({
        transcript: [],
        pendingQuestion: { question: 'Continue?', options: [] },
        pendingApproval: null,
      }),
      getRoomHistory: vi.fn().mockResolvedValue([]),
      streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
      cancelRun: vi.fn(),
    };
    const hook = renderHook(() =>
      useChatConversation({
        userId: 'same-user',
        roomKey: 'shared-key',
        store,
        controller: controller as never,
        ...blocks,
      }),
    );
    return { hook, blocks, controller };
  });
  await waitFor(() =>
    tabs.forEach((tab) => expect(tab.blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1)),
  );
  tabs[0]?.hook.unmount();
  for (const tab of tabs.slice(1)) {
    const handlers = tab.blocks.subscribeMessageBlocks.mock
      .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
    let result: unknown;
    await act(async () => {
      result = await handlers.recover?.('transport_failure');
    });
    expect(result).toEqual({ cursor: undefined, resume: true });
    expect(tab.blocks.subscribeMessageBlocks.mock.results[0]?.value.close).not.toHaveBeenCalled();
    tab.hook.unmount();
  }
  tabs.forEach((tab) => expect(tab.controller.cancelRun).not.toHaveBeenCalled());
});

it('leaves transient restoration failures to the subscription retry budget', async () => {
  const store = fakeStore();
  store.setRoomId('room-1');
  const blocks = fakeMessageBlockControllers();
  blocks.listMessageBlockHistory
    .mockResolvedValueOnce([])
    .mockRejectedValue(new Error('Temporary history failure'));
  const controller = {
    getSessionState: vi
      .fn()
      .mockResolvedValue({ transcript: [], pendingQuestion: null, pendingApproval: null }),
    getRoomHistory: vi.fn().mockResolvedValue([]),
    streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
  };
  const { result, unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'key',
      store,
      controller: controller as never,
      ...blocks,
    }),
  );
  await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1));
  const handlers = blocks.subscribeMessageBlocks.mock
    .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
  await act(async () => {
    await expect(handlers.recover?.('transport_failure')).rejects.toThrow(
      'Temporary history failure',
    );
  });
  expect(result.current.error).toBeNull();
  act(() => handlers.onError(new Error('Retries exhausted')));
  expect(result.current.error).toBe(
    'Chat updates stopped. Reconnect to restore the latest conversation state.',
  );
  unmount();
});

it('does not let an older idle snapshot pause a run accepted while recovery was in flight', async () => {
  const store = fakeStore();
  store.setRoomId('room-1');
  const blocks = fakeMessageBlockControllers();
  const idle = { transcript: [], pendingQuestion: null, pendingApproval: null };
  let finishRestore: ((value: typeof idle) => void) | undefined;
  let acceptSend:
    | ((value: {
        roomId: string;
        runId: string;
        roomEventsUrl: string;
        queuePosition: number;
      }) => void)
    | undefined;
  const controller = {
    getSessionState: vi
      .fn()
      .mockResolvedValueOnce(idle)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRestore = resolve;
          }),
      ),
    getRoomHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(
      () =>
        new Promise((resolve) => {
          acceptSend = resolve;
        }),
    ),
    streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
  };
  const { result, unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'key',
      store,
      controller: controller as never,
      ...blocks,
    }),
  );
  await waitFor(() => expect(blocks.subscribeMessageBlocks).toHaveBeenCalledTimes(1));
  const handlers = blocks.subscribeMessageBlocks.mock
    .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
  act(() => handlers.onStateChange?.('connected'));
  let sending: Promise<void> | undefined;
  act(() => {
    sending = result.current.send('new turn');
  });
  expect(controller.sendMessage).toHaveBeenCalledTimes(1);
  let recovering: ReturnType<NonNullable<typeof handlers.recover>> | undefined;
  act(() => {
    handlers.onStateChange?.('reconnecting');
    recovering = handlers.recover?.('transport_failure');
  });
  await act(async () => {
    acceptSend?.({
      roomId: 'room-1',
      runId: 'new-run',
      roomEventsUrl: '/events',
      queuePosition: 0,
    });
    await sending;
  });
  let restored: unknown;
  await act(async () => {
    finishRestore?.(idle);
    restored = await recovering;
  });
  expect(restored).toEqual({ cursor: undefined, resume: true });
  expect(handlers.shouldReconnect?.()).toBe(true);
  expect(controller.sendMessage).toHaveBeenCalledTimes(1);
  unmount();
});

it('restores a pending plan and keeps message-block rotations active without duplicating the plan', async () => {
  const store = fakeStore();
  store.setRoomId('room-1');
  const pendingPlan = { summary: 'Review the plan', steps: [] };
  const getSessionState = vi.fn().mockResolvedValue({
    transcript: [],
    pendingQuestion: null,
    pendingApproval: null,
    pendingPlan,
  });
  const subscribe = vi.fn().mockReturnValue({ close: vi.fn() });
  const controller = {
    getSessionState,
    getRoomHistory: vi.fn().mockResolvedValue([]),
    streamEvents: vi.fn().mockResolvedValue(sseStreamOf([])),
    sendMessage: vi.fn(),
  };
  const { unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'key',
      store,
      controller: controller as never,
      listMessageBlockHistory: vi.fn().mockResolvedValue([]),
      subscribeMessageBlocks: subscribe,
    }),
  );
  try {
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    const handlers = subscribe.mock
      .calls[0]?.[1] as import('@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller').SubscribeMessageBlocksControllerHandlers;
    expect(store.messages.filter((message) => message.runAwaitingPlan)).toHaveLength(1);
    expect(handlers.shouldReconnect?.()).toBe(true);
    act(() => handlers.onStateChange?.('paused'));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    const restored = subscribe.mock.calls[1]?.[1] as typeof handlers;
    expect(restored.shouldReconnect?.()).toBe(true);
    expect(store.messages.filter((message) => message.runAwaitingPlan)).toHaveLength(1);
    expect(getSessionState).toHaveBeenCalledTimes(2);
    expect(controller.sendMessage).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

it('resumes the same run cursor after a simulated 300-second gateway interruption without resending', async () => {
  const store = fakeStore();
  const sources: ReadableStreamDefaultController<Uint8Array>[] = [];
  const signals: AbortSignal[] = [];
  const streamEvents = vi.fn(
    (_user: string, _room: string, _cursor: string | undefined, signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(
        new ReadableStream<Uint8Array>({
          start(source) {
            sources.push(source);
          },
        }),
      );
    },
  );
  const sendMessage = vi.fn().mockResolvedValue({
    roomId: 'room-long',
    runId: 'run-long',
    roomEventsUrl: '/events',
    queuePosition: 0,
  });
  const controller = {
    sendMessage,
    streamEvents,
    getSessionState: vi
      .fn()
      .mockResolvedValue({ transcript: [], pendingQuestion: null, pendingApproval: null }),
  };
  const { result, unmount } = renderHook(() =>
    useChatConversation({
      userId: 'user',
      roomKey: 'long',
      store,
      controller: controller as never,
      ...fakeMessageBlockControllers(),
    }),
  );
  const frame = (id: number, text: string) =>
    new TextEncoder().encode(
      `id: run-long:${id}\nevent: text\ndata: ${JSON.stringify({ run_id: 'run-long', data: text })}\n\n`,
    );
  try {
    await act(async () => {
      await result.current.send('one prompt');
    });
    await waitFor(() => expect(streamEvents).toHaveBeenCalledTimes(1));
    await act(async () => {
      sources[0]?.enqueue(frame(43, 'Before '));
    });
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
    });
    expect(streamEvents).toHaveBeenCalledTimes(1);
    await act(async () => {
      sources[0]?.error(new TypeError('simulated backend timeout'));
    });
    expect(result.current.streamStatus).toBe('reconnecting');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(streamEvents).toHaveBeenCalledTimes(2);
    expect(streamEvents).toHaveBeenLastCalledWith(
      'user',
      'room-long',
      'run-long:43',
      expect.any(AbortSignal),
    );
    await act(async () => {
      sources[1]?.enqueue(frame(44, 'after'));
    });
    expect(result.current.streamStatus).toBe('connected');
    expect(store.messages.find((m) => m.role === 'assistant')?.content).toBe('Before after');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  } finally {
    unmount();
    vi.useRealTimers();
  }
});
