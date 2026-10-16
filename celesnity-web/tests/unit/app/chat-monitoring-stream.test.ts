import { describe, expect, it } from 'vitest';

import { parseMonitoringSseStream } from '../../../app/(workspace)/chat/_components/parse-monitoring-sse-stream';

describe('parseMonitoringSseStream', () => {
  it('keeps reading after a completed run and returns parsed room frames', async () => {
    const source = [
      'event: run_started\nid: 4\ndata: {"run_id":"run-1"}\n\n',
      'event: text\ndata: {"run_id":"run-1","data":"first"}\n\n',
      'event: run_finished\nid: 5\ndata: {"run_id":"run-1","status":"completed"}\n\n',
      'event: text\ndata: {"run_id":"run-2","data":"second"}\n\n',
    ].join('');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(source));
        controller.close();
      },
    });
    const frames: { eventType?: string; id?: string; runId?: unknown }[] = [];

    await parseMonitoringSseStream(stream, new AbortController().signal, (frame) => {
      frames.push({ eventType: frame.eventType, id: frame.id, runId: frame.payload.run_id });
    });

    expect(frames).toEqual([
      { eventType: 'run_started', id: '4', runId: 'run-1' },
      { eventType: 'text', id: undefined, runId: 'run-1' },
      { eventType: 'run_finished', id: '5', runId: 'run-1' },
      { eventType: 'text', id: undefined, runId: 'run-2' },
    ]);
  });
});
