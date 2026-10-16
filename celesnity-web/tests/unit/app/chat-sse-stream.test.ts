import { describe, expect, it } from 'vitest';

import { parseSseStream } from '@/app/_components/chat/parse-sse-stream';

function streamOf(frames: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(frames.join('')));
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  it('forwards text and reasoning deltas for their run', async () => {
    const source = [
      `event: reasoning\ndata: ${JSON.stringify({ type: 'reasoning', data: 'thinking', run_id: 'run-1' })}\n\n`,
      `event: text\ndata: ${JSON.stringify({ type: 'text', data: 'hello', run_id: 'run-1' })}\n\n`,
    ];
    const chunks: string[] = [];
    const reasoning: string[] = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: (_runId, text) => chunks.push(text),
      onReasoning: (_runId, text) => reasoning.push(text),
    });

    expect(chunks).toEqual(['hello']);
    expect(reasoning).toEqual(['thinking']);
  });

  it('forwards the terminal response without treating it as another text chunk', async () => {
    const source = [
      `event: text\ndata: ${JSON.stringify({ type: 'text', data: 'Hello! ', run_id: 'run-1' })}\n\n`,
      `event: done\ndata: ${JSON.stringify({
        type: 'done',
        run_id: 'run-1',
        data: { response_text: 'Hello! How can I help you today?' },
      })}\n\n`,
    ];
    const chunks: string[] = [];
    const completed: Array<{ runId: string; text: string }> = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: (_runId, text) => chunks.push(text),
      onCompletedResponse: (runId, text) => completed.push({ runId, text }),
    });

    expect(chunks).toEqual(['Hello! ']);
    expect(completed).toEqual([{ runId: 'run-1', text: 'Hello! How can I help you today?' }]);
  });

  it('parses CRLF frames and flushes the final frame when the stream closes', async () => {
    const source = `event: done\r\ndata: ${JSON.stringify({
      run_id: 'run-1',
      data: { response_text: 'Hello from the chat screen' },
    })}\r\n\r\n`.slice(0, -2);
    const completed: string[] = [];

    await parseSseStream(streamOf([source]), new AbortController().signal, {
      onChunk: () => undefined,
      onCompletedResponse: (_runId, text) => completed.push(text),
    });

    expect(completed).toEqual(['Hello from the chat screen']);
  });

  it('reports tool_started with a name and tool_finished without one', async () => {
    const source = [
      `event: tool_started\ndata: ${JSON.stringify({
        type: 'tool_started',
        run_id: 'run-1',
        data: { id: 'tool-1', name: 'trino_query', args: {} },
      })}\n\n`,
      `event: tool_finished\ndata: ${JSON.stringify({
        type: 'tool_finished',
        run_id: 'run-1',
        data: { id: 'tool-1', ok: true },
      })}\n\n`,
    ];
    const events: unknown[] = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onToolEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { runId: 'run-1', id: 'tool-1', name: 'trino_query', status: 'running', arguments: {} },
      { runId: 'run-1', id: 'tool-1', name: null, status: 'done' },
    ]);
  });

  it('forwards every replayed event with its sequence for durable UI hydration', async () => {
    const source = [
      `id: run-1:7\nevent: tool_started\ndata: ${JSON.stringify({
        run_id: 'run-1',
        data: { id: 'tool-1', name: 'trino_query', arguments: {} },
      })}\n\n`,
    ];
    const events: unknown[] = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onEvent: (runId, event, seq) => events.push({ runId, event, seq }),
    });

    expect(events).toEqual([
      {
        runId: 'run-1',
        event: { type: 'tool_started', data: { id: 'tool-1', name: 'trino_query', arguments: {} } },
        seq: 'run-1:7',
      },
    ]);
  });

  it('maps an awaiting_input question', async () => {
    const source = [
      `event: awaiting_input\ndata: ${JSON.stringify({
        type: 'awaiting_input',
        run_id: 'run-1',
        data: {
          version: 1,
          kind: 'choice',
          question: 'Which pipeline?',
          options: [{ label: 'orders', description: null }],
          allow_other: false,
        },
      })}\n\n`,
    ];
    let request: unknown;

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onAwaitingInput: (_runId, req) => {
        request = req;
      },
    });

    expect(request).toEqual({
      question: 'Which pipeline?',
      allowOther: false,
      options: [{ label: 'orders', description: null }],
    });
  });

  it('maps an awaiting_approval request', async () => {
    const source = [
      `event: awaiting_approval\ndata: ${JSON.stringify({
        type: 'awaiting_approval',
        run_id: 'run-1',
        data: {
          approval_id: 'approval-1',
          action: 'document.create',
          preview: 'Create report.md',
          expires_at: '2026-09-16T10:00:00.000Z',
        },
      })}\n\n`,
    ];
    let approval: unknown;

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onAwaitingApproval: (_runId, request) => {
        approval = request;
      },
    });

    expect(approval).toEqual({
      approvalId: 'approval-1',
      action: 'document.create',
      preview: 'Create report.md',
      expiresAt: '2026-09-16T10:00:00.000Z',
    });
  });

  it('reports token usage per iteration without summing', async () => {
    const source = [
      `event: token_usage\ndata: ${JSON.stringify({
        type: 'token_usage',
        run_id: 'run-1',
        data: { input: 120, output: 45 },
      })}\n\n`,
      `event: token_usage\ndata: ${JSON.stringify({
        type: 'token_usage',
        run_id: 'run-1',
        data: { input: 30, output: 10 },
      })}\n\n`,
    ];
    const deltas: Array<{ input: number; output: number }> = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onTokenUsage: (_runId, delta) => deltas.push(delta),
    });

    expect(deltas).toEqual([
      { input: 120, output: 45 },
      { input: 30, output: 10 },
    ]);
  });

  it('reports the latest context usage percentage', async () => {
    const source = [
      `event: context_usage\ndata: ${JSON.stringify({
        type: 'context_usage',
        run_id: 'run-1',
        data: 42.5,
      })}\n\n`,
    ];
    const values: number[] = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onContextUsagePct: (_runId, pct) => values.push(pct),
    });

    expect(values).toEqual([42.5]);
  });

  it('reports workspace changes with web field names and skips unsupported kinds', async () => {
    const source = [
      `event: workspace_changed\ndata: ${JSON.stringify({
        type: 'workspace_changed',
        run_id: 'run-1',
        data: {
          changes: [
            { rel_path: 'src/app.ts', kind: 'modified' },
            { rel_path: 'notes/todo.md', kind: 'created' },
            { rel_path: 'old.txt', kind: 'deleted' },
            { rel_path: 'unknown.bin', kind: 'renamed' },
          ],
        },
      })}\n\n`,
    ];
    const changes: Array<{ runId: string; changes: readonly { path: string; kind: string }[] }> =
      [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onWorkspaceChanged: (runId, entries) => changes.push({ runId, changes: entries }),
    });

    expect(changes).toEqual([
      {
        runId: 'run-1',
        changes: [
          { path: 'src/app.ts', kind: 'modified' },
          { path: 'notes/todo.md', kind: 'created' },
          { path: 'old.txt', kind: 'deleted' },
        ],
      },
    ]);
  });

  it('reports the run status carried by the journaled run_finished frame', async () => {
    const source = [
      `event: run_finished\ndata: ${JSON.stringify({
        type: 'run_finished',
        run_id: 'run-1',
        agent_id: 'agent-1',
        status: 'failed',
      })}\n\n`,
    ];
    const finished: Array<{ runId: string; status: string }> = [];

    await parseSseStream(streamOf(source), new AbortController().signal, {
      onChunk: () => undefined,
      onRunFinished: (runId, status) => finished.push({ runId, status }),
    });

    expect(finished).toEqual([{ runId: 'run-1', status: 'failed' }]);
  });
});
