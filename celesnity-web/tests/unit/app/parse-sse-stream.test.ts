import { describe, expect, it, vi } from 'vitest';

import { parseSseStream } from '@/app/_components/chat/parse-sse-stream';

describe('parseSseStream', () => {
  it('hands a started tool call to the UI with its arguments', async () => {
    const onToolEvent = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: tool_started\ndata: {"run_id":"run-1","data":{"id":"call-1","name":"mcp__trino__list_tables","arguments":{"catalog":"iceberg","schema":"public"}}}\n\n' +
              'event: tool_finished\ndata: {"run_id":"run-1","data":{"id":"call-1","name":"mcp__trino__list_tables","success":true}}\n\n',
          ),
        );
        controller.close();
      },
    });

    await parseSseStream(stream, new AbortController().signal, { onChunk: vi.fn(), onToolEvent });

    expect(onToolEvent).toHaveBeenNthCalledWith(1, {
      runId: 'run-1',
      id: 'call-1',
      name: 'mcp__trino__list_tables',
      status: 'running',
      arguments: { catalog: 'iceberg', schema: 'public' },
    });
    expect(onToolEvent).toHaveBeenNthCalledWith(2, {
      runId: 'run-1',
      id: 'call-1',
      name: null,
      status: 'done',
    });
  });

  /* The agent pauses with `awaiting_client_tool`, but the parser only knew
     `client_tool_call`, so the browser never ran the tool and the run sat
     waiting for an answer that could not come. */
  it('hands a client tool pause to the UI under the name the agent emits', async () => {
    const onClientToolCall = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: awaiting_client_tool\ndata: {"run_id":"run-1","data":{"id":"call-nav","name":"NavigateToChart","arguments":{"chart_id":"c_8f21"}}}\n\n',
          ),
        );
        controller.close();
      },
    });

    await parseSseStream(stream, new AbortController().signal, {
      onChunk: vi.fn(),
      onClientToolCall,
    });

    expect(onClientToolCall).toHaveBeenCalledWith('run-1', {
      id: 'call-nav',
      name: 'NavigateToChart',
      arguments: { chart_id: 'c_8f21' },
    });
  });
});
