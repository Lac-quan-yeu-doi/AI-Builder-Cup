// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatScreen } from '@/app/(workspace)/chat/_components/chat-screen';
import type { ManageChatController } from '@/src/interface-adapters/controllers/chat/manage-chat.controller';
import type { SubscribeMessageBlocksControllerHandlers } from '@/src/interface-adapters/controllers/message-blocks/subscribe-message-blocks.controller';
import { renderUi } from '@/tests/support/render-ui';
import { useChatSessionsStore } from '@/app/_stores/chat-sessions.store';

/** Stands in for the address bar, so a test can change the query string. */
const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

// The chat sessions store hydrates from `ManageChatController.listSessions`
// (see chat-sessions.store.ts) — a conversation "already there" when a test
// renders ChatScreen has to come from this, not from seeding storage: the
// store no longer caches anything locally. Nothing else in this file
// exercises DI (ChatScreen itself never calls getInjection — everything it
// needs arrives as props), so a blanket mock is safe here, matching
// chat-sessions.store.test.ts's own pattern.
const { listSessions, getInjection } = vi.hoisted(() => ({
  listSessions: vi.fn().mockResolvedValue([]),
  getInjection: vi.fn(() => ({ listSessions })),
}));

vi.mock('@/di/container', () => ({ getInjection }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

// Each frame is enqueued on its own macrotask (rather than joined into one
// chunk) so every `reader.read()` in parseSseStream lands in a separate
// render pass instead of being coalesced by React's automatic batching —
// matching how SSE frames actually arrive on the wire as discrete network
// reads, and letting the test observe the ticker updating incrementally.
function streamOf(frames: readonly string[]): ReadableStream<Uint8Array> {
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

function fakeController(streamFrames: readonly string[] = []): ManageChatController {
  const sendMessage = vi.fn().mockResolvedValue({
    runId: 'run-1',
    roomId: 'room-1',
    roomEventsUrl: '/rooms/room-1/events',
    queuePosition: 0,
  });
  return Object.assign(sendMessage, {
    sendMessage,
    streamEvents: vi.fn().mockResolvedValue(streamOf(streamFrames)),
    streamRunEvents: vi.fn().mockResolvedValue(streamOf(streamFrames)),
    getSessionState: vi.fn().mockResolvedValue({ transcript: [], pendingQuestion: null }),
    checkHealth: vi.fn().mockResolvedValue(true),
    getRunManifest: vi.fn(),
    getRunTrace: vi.fn(),
    getRunReport: vi.fn(),
    getRunValidation: vi.fn(),
    getRoomMetrics: vi.fn().mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      running: 0,
      p50DurationMs: null,
      p95DurationMs: null,
    }),
  }) as unknown as ManageChatController;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // The conversations live in a module-scoped store now, which outlives the
  // component tree a test unmounts.
  useChatSessionsStore.setState({ sessions: [], activeSessionId: null, hydrated: false });
  navigation.searchParams = new URLSearchParams();
  navigation.replace.mockReset();
  listSessions.mockReset().mockResolvedValue([]);
});

describe('ChatScreen run observability', () => {
  it('does not render the removed token and context observability pill', async () => {
    const frames = [
      `event: token_usage\ndata: ${JSON.stringify({ type: 'token_usage', run_id: 'run-1', data: { input: 100, output: 40 } })}\n\n`,
      `event: token_usage\ndata: ${JSON.stringify({ type: 'token_usage', run_id: 'run-1', data: { input: 20, output: 5 } })}\n\n`,
      `event: context_usage\ndata: ${JSON.stringify({ type: 'context_usage', run_id: 'run-1', data: 42.5 })}\n\n`,
    ];
    const controller = fakeController(frames);

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByLabelText('Tokens (in / out)')).toBeNull();
      expect(screen.queryByLabelText('Context')).toBeNull();
    });
  });
});

describe('ChatScreen agent selection', () => {
  it('sends the selected tenant manifest when starting a conversation', async () => {
    const controller = fakeController();
    const listAgentManifests = vi.fn().mockResolvedValue([
      {
        name: 'writer',
        description: 'Writes reports.',
        skills: [],
        sourcePath: 'agents/writer.yaml',
        contentHash: 'writer-hash',
        yaml: 'name: writer\n',
      },
      {
        name: 'analyst',
        description: 'Analyzes data.',
        skills: [],
        sourcePath: 'agents/analyst.yaml',
        contentHash: 'analyst-hash',
        yaml: 'name: analyst\n',
      },
    ]);

    renderUi(
      createElement(ChatScreen, {
        controller,
        listAgentManifests,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const agentPicker = await screen.findByRole('button', { name: 'Agent' });
    expect(agentPicker.textContent).toContain('writer');
    fireEvent.keyDown(agentPicker, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'analyst' }));

    const prompt = await screen.findByLabelText('Chat prompt');
    fireEvent.change(prompt, { target: { value: 'Create a report' } });
    fireEvent.keyDown(prompt, { key: 'Enter' });

    await waitFor(() =>
      expect(controller.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'analyst', message: 'Create a report' }),
      ),
    );
  });
});

describe('ChatScreen conversation recovery', () => {
  it('reloads a completed assistant response when returning to a conversation', async () => {
    // "Returning to a conversation" means the server already knows about it
    // (see chat-sessions.store.ts's hydrate) and the URL names it — there is
    // no local cache to seed instead.
    listSessions.mockResolvedValue([{ id: 'session-1', roomId: 'room-1', title: 'hello' }]);
    navigation.searchParams = new URLSearchParams('session=session-1');

    const controller = fakeController();
    controller.getSessionState = vi.fn().mockResolvedValue({
      transcript: [
        { role: 'user', content: 'hello', reasoning: null },
        { role: 'assistant', content: 'Recovered response', reasoning: null },
      ],
      pendingQuestion: null,
    });

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    await waitFor(() => expect(screen.getByText('Recovered response')).not.toBeNull());
    expect(controller.getSessionState).toHaveBeenCalledWith('local-user', 'room-1');
    // The fourth argument is the abort signal: it has to reach the request, or
    // closing a room's stream leaves its connection open.
    expect(controller.streamEvents).toHaveBeenCalledWith(
      'local-user',
      'room-1',
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('does not ask the server for a transcript of a conversation with no room yet', async () => {
    // A draft (typed but not yet sent, or a send still in flight) has no
    // sessionKey the server would recognise — getSessionTranscript's own
    // 404 for it is expected and harmless (caught, ignored), but there is
    // nothing to recover here, so it should not be asked at all.
    const controller = fakeController();

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    await waitFor(() => expect(useChatSessionsStore.getState().hydrated).toBe(true));
    useChatSessionsStore.getState().setSessions([
      {
        id: 'draft-1',
        roomId: null,
        title: 'draft',
        messages: [],
        databaseName: null,
        agentName: null,
      },
    ]);
    useChatSessionsStore.getState().setActiveSessionId('draft-1');

    // Let the recovery effect's microtasks settle before asserting a negative.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(controller.getSessionState).not.toHaveBeenCalled();
  });

  it('keeps a restored artifact in the assistant dialogue after a reload', async () => {
    listSessions.mockResolvedValue([{ id: 'session-1', roomId: 'room-1', title: 'hello' }]);
    navigation.searchParams = new URLSearchParams('chatId=room-1');

    const controller = fakeController();
    controller.getSessionState = vi.fn().mockResolvedValue({
      transcript: [
        { role: 'user', content: 'show late orders', reasoning: null },
        { role: 'assistant', content: 'Here are the late orders.', reasoning: null },
      ],
      pendingQuestion: null,
    });
    const restoredTable = {
      id: 'restored-table',
      runId: 'run-from-yesterday',
      blockType: 'table' as const,
      fallbackText: 'Late orders',
      payload: {
        title: 'Late orders',
        columns: [{ key: 'order', label: 'Order' }],
        rows: [{ order: 'SO-10422' }],
      },
      publishedAt: '2026-09-15T10:00:00.000Z',
    };

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([restoredTable]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByRole('log')).getByRole('button', { name: 'Late orders Table' }),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole('region', { name: 'Artifacts from this conversation' })).toBeNull();
  });
});

describe('ChatScreen chat identity', () => {
  it('keeps the floating chat controls above the transcript fade', async () => {
    listSessions.mockResolvedValue([{ id: 'session-1', roomId: 'room-1', title: 'hello' }]);
    navigation.searchParams = new URLSearchParams('session=session-1');

    renderUi(
      createElement(ChatScreen, {
        controller: fakeController(),
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn(),
      }),
    );

    const newConversation = await screen.findByRole('button', { name: 'New conversation' });
    const controls = newConversation.parentElement;
    expect(controls?.className).toMatch(/\brelative\b/u);
    expect(controls?.className).toMatch(/\bz-10\b/u);
  });

  it('does not render the chat identity or room metrics pills', async () => {
    listSessions.mockResolvedValue([{ id: 'session-1', roomId: 'room-1', title: 'hello' }]);
    navigation.searchParams = new URLSearchParams('session=session-1');
    const controller = Object.assign(fakeController(), {
      getRoomMetrics: vi.fn().mockResolvedValue({
        total: 1,
        succeeded: 1,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        running: 0,
        p50DurationMs: 1000,
        p95DurationMs: 128100,
      }),
    }) as ManageChatController;

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    await screen.findByRole('button', { name: 'New conversation' });
    expect(screen.queryByText('room-1')).toBeNull();
    expect(screen.queryByText('p95 128.1s')).toBeNull();
  });

  it('does not render a pending chat identity on the landing view', async () => {
    renderUi(
      createElement(ChatScreen, {
        controller: fakeController(),
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    await screen.findByLabelText('Chat prompt');
    expect(screen.queryByText('Not created yet')).toBeNull();
  });
});

describe('ChatScreen pending agent questions', () => {
  it('renders a free-text question when the active run awaits user input', async () => {
    const question = 'What should the report cover?';
    const controller = fakeController([
      `event: awaiting_input\ndata: ${JSON.stringify({
        type: 'awaiting_input',
        run_id: 'run-1',
        data: { version: 1, kind: 'free_text', question, options: [], allow_other: true },
      })}\n\n`,
      `event: run_finished\ndata: ${JSON.stringify({
        type: 'run_finished',
        run_id: 'run-1',
        status: 'awaiting_input',
      })}\n\n`,
    ]);

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'create a report' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(await screen.findByText(question)).not.toBeNull();
    const awaitingInputTextarea = screen.getByLabelText('Follow-up prompt');
    expect(awaitingInputTextarea.hasAttribute('disabled')).toBe(false);
    fireEvent.change(awaitingInputTextarea, { target: { value: 'quick template' } });
    fireEvent.keyDown(awaitingInputTextarea, { key: 'Enter' });

    await waitFor(() => {
      expect(controller.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ roomId: 'room-1', message: 'quick template' }),
      );
    });
  });

  it('submits a selected option into the existing room', async () => {
    const controller = fakeController([
      `event: awaiting_input\ndata: ${JSON.stringify({
        type: 'awaiting_input',
        run_id: 'run-1',
        data: {
          version: 1,
          kind: 'choice',
          question: 'Which format?',
          options: [{ label: 'Markdown', description: 'A Markdown report' }],
          allow_other: false,
        },
      })}\n\n`,
      `event: run_finished\ndata: ${JSON.stringify({
        type: 'run_finished',
        run_id: 'run-1',
        status: 'awaiting_input',
      })}\n\n`,
    ]);

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'create a report' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    const choice = await screen.findByRole('button', { name: /Markdown/ });
    const awaitingInputTextarea = screen.getByLabelText('Follow-up prompt');
    expect(awaitingInputTextarea.hasAttribute('disabled')).toBe(true);
    fireEvent.click(choice);

    await waitFor(() => {
      expect(controller.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ roomId: 'room-1', message: 'Markdown' }),
      );
    });
  });
});

describe('ChatScreen message-block wiring', () => {
  it('fetches history then subscribes live once a room exists', async () => {
    const controller = fakeController();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([
      {
        id: 'hist-1',
        runId: 'run-1',
        blockType: 'text',
        payload: { text: 'from history' },
        fallbackText: 'from history',
      },
    ]);
    const close = vi.fn();
    const subscribeMessageBlocks = vi.fn().mockReturnValue({ close });

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(listMessageBlockHistory).toHaveBeenCalledWith('room-1');
    });
    await waitFor(() => {
      expect(subscribeMessageBlocks).toHaveBeenCalledWith('room-1', expect.anything(), 'hist-1');
    });
  });

  it('appends a live block onto the message matching its runId', async () => {
    const controller = fakeController();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    let onBlock: SubscribeMessageBlocksControllerHandlers['onBlock'] | undefined;
    const subscribeMessageBlocks = vi.fn(
      (_roomId: string, handlers: SubscribeMessageBlocksControllerHandlers) => {
        onBlock = handlers.onBlock;
        return { close: vi.fn() };
      },
    );

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());
    onBlock?.({
      id: 'live-1',
      runId: 'run-1',
      blockType: 'text',
      payload: { text: 'live-block-text' },
      fallbackText: 'live-block-text',
    });

    await waitFor(() => {
      expect(screen.getByText('live-block-text')).not.toBeNull();
    });
  });

  it('opens a pane for a chart or table the moment it arrives', async () => {
    /*
     * The design system's first rule: the stage appears when the agent has
     * produced something worth a pane. A card in the transcript is the index,
     * but the answer to the question just asked should not need a second click.
     */
    const controller = fakeController();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    let onBlock: SubscribeMessageBlocksControllerHandlers['onBlock'] | undefined;
    const subscribeMessageBlocks = vi.fn(
      (_roomId: string, handlers: SubscribeMessageBlocksControllerHandlers) => {
        onBlock = handlers.onBlock;
        return { close: vi.fn() };
      },
    );

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'which orders are late?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());

    /* No stage until there is something worth one. */
    expect(document.querySelector('[data-stage-layout]')).toBeNull();

    onBlock?.({
      id: 'blk-1',
      runId: 'run-1',
      blockType: 'table',
      fallbackText: 'Late orders',
      payload: {
        title: 'Late orders',
        columns: [
          { key: 'order', label: 'Order' },
          { key: 'line', label: 'Line' },
        ],
        rows: [
          { order: 'SO-10422', line: 'Line 2' },
          { order: 'SO-10431', line: 'Line 2' },
        ],
      },
    });

    /* The pane, with the artifact's own rows in it. */
    await waitFor(() => expect(document.querySelector('[data-stage-layout]')).not.toBeNull());
    await waitFor(() => expect(screen.getByText('SO-10422')).not.toBeNull());

    /* And the card in the transcript, wearing the open border. */
    expect(screen.getAllByText('Late orders').length).toBeGreaterThan(0);
    expect(document.querySelector('.group\\/artifact')?.className).toContain('border-primary/40');
  });

  it('leaves a pane closed once somebody closes it', async () => {
    const controller = fakeController();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    let onBlock: SubscribeMessageBlocksControllerHandlers['onBlock'] | undefined;
    const subscribeMessageBlocks = vi.fn(
      (_roomId: string, handlers: SubscribeMessageBlocksControllerHandlers) => {
        onBlock = handlers.onBlock;
        return { close: vi.fn() };
      },
    );

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'which orders are late?' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());

    onBlock?.({
      id: 'blk-1',
      runId: 'run-1',
      blockType: 'table',
      fallbackText: 'Late orders',
      payload: { title: 'Late orders', columns: [{ key: 'order', label: 'Order' }], rows: [] },
    });
    await waitFor(() => expect(document.querySelector('[data-stage-layout]')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Close pane' }));

    /* A later render must not put it back, which is what would make an
       automatic pane unbearable. */
    await waitFor(() => expect(document.querySelector('[data-stage-layout]')).toBeNull());
    fireEvent.change(textarea, { target: { value: 'and the week before?' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.querySelector('[data-stage-layout]')).toBeNull();
  });

  it('closes the subscription on unmount', async () => {
    const controller = fakeController();
    const close = vi.fn();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    const subscribeMessageBlocks = vi.fn().mockReturnValue({ close });

    const { unmount } = renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());

    unmount();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the old subscription and opens a new one when switching sessions', async () => {
    const controller = fakeController();
    const closeFirst = vi.fn();
    const listMessageBlockHistory = vi.fn().mockResolvedValue([]);
    const subscribeMessageBlocks = vi.fn().mockReturnValue({ close: closeFirst });

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));

    expect(closeFirst).toHaveBeenCalledTimes(1);
  });
});

describe('ChatScreen deep links', () => {
  const props = () => ({
    controller: fakeController(),
    listMessageBlockHistory: vi.fn().mockResolvedValue([]),
    subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
    listCharts: vi.fn().mockResolvedValue([]),
    subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
    listPendingActions: vi.fn().mockResolvedValue([]),
    approvePendingAction: vi.fn(),
    rejectPendingAction: vi.fn(),
    resolveCitations: vi.fn().mockResolvedValue([]),
  });

  // The server (listSessions) supplies which conversations exist; their
  // message content still hydrates lazily per-conversation via
  // getSessionTranscript, same as production.
  const seedTwoConversations = (): void => {
    listSessions.mockResolvedValue([
      { id: 's-alpha', roomId: 'r1', title: 'Alpha' },
      { id: 's-beta', roomId: 'r2', title: 'Beta' },
    ]);
  };

  const propsWithTranscripts = () => {
    const controller = fakeController();
    // getSessionTranscript takes the room's id (roomId), not the session's —
    // see AgentApiChatRepository.getSessionTranscript's doc.
    controller.getSessionState = vi.fn().mockImplementation((_userId: string, roomId: string) =>
      Promise.resolve({
        transcript:
          roomId === 'r1'
            ? [{ role: 'user', content: 'alpha body', reasoning: null }]
            : roomId === 'r2'
              ? [{ role: 'user', content: 'beta body', reasoning: null }]
              : [],
        pendingQuestion: null,
      }),
    );
    return { ...props(), controller };
  };

  it('switches conversations when the query string changes after mount', async () => {
    seedTwoConversations();
    navigation.searchParams = new URLSearchParams('session=s-alpha');
    const view = renderUi(createElement(ChatScreen, propsWithTranscripts()));
    expect(await screen.findByText('alpha body')).toBeTruthy();

    // What clicking a sidebar entry does: same route, so nothing remounts and
    // only the query string moves. A mount-only read ignored it, and the
    // address bar changed while the transcript did not.
    navigation.searchParams = new URLSearchParams('session=s-beta');
    view.rerender(createElement(ChatScreen, propsWithTranscripts()));

    expect(await screen.findByText('beta body')).toBeTruthy();
    // Consumed, so clicking the same entry again is not a dead click.
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/chat', { scroll: false }),
    );
  });

  it('opens a conversation from its server-owned chat id', async () => {
    seedTwoConversations();
    navigation.searchParams = new URLSearchParams('chatId=r2');
    renderUi(createElement(ChatScreen, propsWithTranscripts()));

    expect(await screen.findByText('beta body')).toBeTruthy();
    expect(useChatSessionsStore.getState().activeSessionId).toBe('s-beta');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('opens a conversation when copied chat id URLs include trailing punctuation', async () => {
    seedTwoConversations();
    navigation.searchParams = new URLSearchParams('chatId=r2,');
    renderUi(createElement(ChatScreen, propsWithTranscripts()));

    expect(await screen.findByText('beta body')).toBeTruthy();
    expect(useChatSessionsStore.getState().activeSessionId).toBe('s-beta');
  });

  it('writes a server-owned chat id link when selecting a conversation', async () => {
    seedTwoConversations();
    renderUi(createElement(ChatScreen, propsWithTranscripts()));

    fireEvent.keyDown(await screen.findByRole('button', { name: 'Conversations' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }));

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('/chat?chatId=r2', { scroll: false }),
    );
  });

  it('scopes a fresh conversation to the database it was opened from', async () => {
    seedTwoConversations();
    navigation.searchParams = new URLSearchParams('database=demo');
    renderUi(createElement(ChatScreen, props()));

    // The picker names the scope the run will carry.
    expect(await screen.findByTitle('Asking about: demo')).toBeTruthy();
  });
});

describe('ChatScreen send failures', () => {
  it('marks the assistant turn failed when the message cannot be sent', async () => {
    // What a dropped send looked like before: the user's question, a bare
    // "MINDER" heading, and nothing under it — indistinguishable from the
    // assistant choosing to say nothing.
    const controller = fakeController();
    (
      controller as unknown as { sendMessage: ReturnType<typeof vi.fn> }
    ).sendMessage.mockRejectedValue(new Error('Agent unreachable'));

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'Describe don_hang columns' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(await screen.findByText('That run failed.')).toBeTruthy();
  });

  // There used to be a second case here: an empty assistant turn that
  // survived a page reload via localStorage, recognised by the `producedNothing`
  // heuristic in chat-screen.tsx (no runId, no content, no runFailed). Now that
  // nothing persists client-side, that scenario can no longer be constructed —
  // `getSessionTranscript`'s own recovery merge (`mergeTranscriptMessages`)
  // filters out empty assistant turns entirely, so a truly-empty reply never
  // round-trips back on reload in the first place. The heuristic itself is
  // left in place as a live-session safety net; only the reload-recovery test
  // for it is gone, since the state it needed no longer exists to seed.

  it('leaves a turn alone while it is still streaming', async () => {
    // The same shape as a dropped run, one moment earlier. Flagging it here
    // would put a failure notice under every question the instant it is asked.
    const controller = fakeController([
      `event: token_usage\ndata: ${JSON.stringify({ type: 'token_usage', run_id: 'run-1', data: { input: 1, output: 1 } })}\n\n`,
    ]);

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'gà' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(controller.streamEvents).toHaveBeenCalled());
    expect(screen.queryByText('That run failed.')).toBeNull();
  });
});

describe('ChatScreen workspace wiring', () => {
  it('reconciles the workspace after a workspace_changed event', async () => {
    const controller = fakeController([
      `event: workspace_changed\ndata: ${JSON.stringify({
        type: 'workspace_changed',
        run_id: 'run-1',
        data: { changes: [{ rel_path: 'src/app.ts', kind: 'modified' }] },
      })}\n\n`,
    ]);
    const listWorkspaceTree = vi.fn().mockResolvedValue({
      entries: [
        { path: 'src', isDir: true, modifiedAt: '2026-09-09T00:00:00Z' },
        { path: 'src/app.ts', isDir: false, sizeBytes: 10, modifiedAt: '2026-09-09T00:00:00Z' },
      ],
      truncated: false,
    });

    renderUi(
      createElement(ChatScreen, {
        controller,
        listMessageBlockHistory: vi.fn().mockResolvedValue([]),
        subscribeMessageBlocks: vi.fn().mockReturnValue({ close: vi.fn() }),
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
        listWorkspaceTree,
        getWorkspaceFileContent: vi.fn(),
      }),
    );

    const textarea = await screen.findByLabelText('Chat prompt');
    fireEvent.change(textarea, { target: { value: 'inspect the workspace' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    /* The workspace panel moved out of the floating header into the composer's
       add menu, so reaching it now goes through that menu. */
    fireEvent.click(await screen.findByRole('button', { name: 'Add to message' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open workspace files' }));
    await waitFor(() => expect(listWorkspaceTree).toHaveBeenCalledWith('room-1'));
    await waitFor(() => expect(listWorkspaceTree).toHaveBeenCalledTimes(2), { timeout: 1_000 });
  });
});

describe('ChatScreen stream lifecycle', () => {
  it('opens one message-block stream per room, however many callers ask', async () => {
    /*
     * Both the hydration effect and the send ask for the same room's stream.
     * The subscribe used to happen after an awaited history fetch, so both
     * callers got past the guard and both opened a stream — and only the
     * second was remembered, leaving the first open for the life of the page.
     * Six conversations filled the browser's per-host connection budget, after
     * which sends queued forever: no run reached the agent and the reply came
     * back empty.
     */
    listSessions.mockResolvedValue([{ id: 's1', roomId: 'room-1', title: 'gà' }]);
    navigation.searchParams = new URLSearchParams('session=s1');

    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const subscribeMessageBlocks = vi.fn(() => {
      const close = vi.fn();
      closes.push(close);
      return { close };
    });
    // Slow enough that a second caller arrives while the first is still here.
    const listMessageBlockHistory = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), 20)));

    renderUi(
      createElement(ChatScreen, {
        controller: fakeController(),
        listMessageBlockHistory,
        subscribeMessageBlocks,
        listCharts: vi.fn().mockResolvedValue([]),
        subscribeCharts: vi.fn().mockReturnValue({ close: vi.fn() }),
        listPendingActions: vi.fn().mockResolvedValue([]),
        approvePendingAction: vi.fn(),
        rejectPendingAction: vi.fn(),
        resolveCitations: vi.fn().mockResolvedValue([]),
      }),
    );

    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'gà' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(subscribeMessageBlocks).toHaveBeenCalled());
    // Let any second subscribe land before counting.
    await new Promise((resolve) => setTimeout(resolve, 80));

    const live = closes.filter((close) => close.mock.calls.length === 0);
    expect(live).toHaveLength(1);
  });
});
