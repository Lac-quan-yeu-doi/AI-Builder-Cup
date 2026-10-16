import { describe, expect, it, vi } from 'vitest';

import {
  EventSourceMessageBlockProgressService,
  type MessageBlockEventSourceClient,
} from '@/src/infrastructure/services/event-source-message-block-progress.service';

function fakeSource(): MessageBlockEventSourceClient {
  return { onmessage: null, onerror: null, close: vi.fn() };
}

describe('EventSourceMessageBlockProgressService.subscribe', () => {
  it('opens a connection to /rooms/{roomId}/message-blocks/stream', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );

    service.subscribe('room 1', { onBlock: vi.fn(), onError: vi.fn() });

    expect(createEventSource).toHaveBeenCalledWith(
      'http://core.test/api/v1/rooms/room%201/message-blocks/stream',
    );
  });

  it('appends a cursor query param when given one', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );

    service.subscribe('room-1', { onBlock: vi.fn(), onError: vi.fn() }, 'block-9');

    expect(createEventSource).toHaveBeenCalledWith(
      'http://core.test/api/v1/rooms/room-1/message-blocks/stream?cursor=block-9',
    );
  });

  it('forwards a well-formed message_block payload to onBlock', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );
    const onBlock = vi.fn();

    service.subscribe('room-1', { onBlock, onError: vi.fn() });
    source.onmessage?.({
      data: JSON.stringify({
        id: 'block-1',
        room_id: 'room-1',
        run_id: null,
        block_type: 'text',
        version: 1,
        payload: { text: 'hi' },
        fallback_text: 'hi',
        published_at: '2026-08-18T00:00:00.000Z',
      }),
    } as MessageEvent<string>);

    expect(onBlock).toHaveBeenCalledWith({
      id: 'block-1',
      roomId: 'room-1',
      runId: null,
      blockType: 'text',
      version: 1,
      payload: { text: 'hi' },
      fallbackText: 'hi',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
  });

  it('forwards the named message_block event emitted by Core', () => {
    let namedHandler: ((event: MessageEvent<string>) => void) | undefined;
    const source = {
      ...fakeSource(),
      addEventListener: vi.fn((type: string, handler: (event: MessageEvent<string>) => void) => {
        if (type === 'message_block') namedHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      vi.fn().mockReturnValue(source),
    );
    const onBlock = vi.fn();

    service.subscribe('room-1', { onBlock, onError: vi.fn() });
    namedHandler?.({
      data: JSON.stringify({
        id: 'block-chart-1',
        room_id: 'room-1',
        run_id: 'run-1',
        block_type: 'chart',
        version: 1,
        payload: { kind: 'preview' },
        fallback_text: 'Chart preview',
        published_at: '2026-09-14T08:20:25.416Z',
      }),
    } as MessageEvent<string>);

    expect(onBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'block-chart-1', blockType: 'chart', runId: 'run-1' }),
    );
  });

  it('drops an unparseable message rather than throwing', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );
    const onBlock = vi.fn();

    service.subscribe('room-1', { onBlock, onError: vi.fn() });
    expect(() => source.onmessage?.({ data: 'not json' } as MessageEvent<string>)).not.toThrow();
    expect(onBlock).not.toHaveBeenCalled();
  });

  it('calls onError and releases the failed source', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );
    const onError = vi.fn();

    const subscription = service.subscribe('room-1', { onBlock: vi.fn(), onError });
    source.onerror?.(new Event('error'));

    expect(onError).toHaveBeenCalled();
    expect(source.close).toHaveBeenCalled();
    subscription.close();
  });

  it('close() is idempotent and stops forwarding further events', () => {
    const source = fakeSource();
    const createEventSource = vi.fn().mockReturnValue(source);
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );
    const onBlock = vi.fn();

    const subscription = service.subscribe('room-1', { onBlock, onError: vi.fn() });
    subscription.close();
    subscription.close();
    source.onmessage?.({
      data: JSON.stringify({
        id: 'block-1',
        room_id: 'room-1',
        run_id: null,
        block_type: 'text',
        version: 1,
        payload: {},
        fallback_text: 'x',
        published_at: '2026-08-18T00:00:00.000Z',
      }),
    } as MessageEvent<string>);

    expect(source.close).toHaveBeenCalledTimes(1);
    expect(onBlock).not.toHaveBeenCalled();
  });

  it('reports an error and returns a closable subscription if EventSource construction throws', () => {
    const createEventSource = vi.fn().mockImplementation(() => {
      throw new Error('EventSource unsupported');
    });
    const service = new EventSourceMessageBlockProgressService(
      'http://core.test/api/v1',
      createEventSource,
    );
    const onError = vi.fn();

    const subscription = service.subscribe('room-1', { onBlock: vi.fn(), onError });

    expect(onError).toHaveBeenCalled();
    expect(() => subscription.close()).not.toThrow();
  });
});

function lifecycleSource() {
  const listeners = new Map<string, (event: MessageEvent<string>) => void>();
  const source = {
    ...fakeSource(),
    addEventListener: (name: string, listener: (event: MessageEvent<string>) => void) => {
      listeners.set(name, listener);
    },
    removeEventListener: (name: string) => {
      listeners.delete(name);
    },
    emit: (name: string, data = '{}') => listeners.get(name)?.(new MessageEvent(name, { data })),
  };
  return source;
}

describe('Message-block connection policy', () => {
  it('pauses after normal rotation without an error, retaining the connection cursor', async () => {
    vi.useFakeTimers();
    const source = lifecycleSource();
    const error = vi.fn();
    const state = vi.fn();
    const factory = vi.fn().mockReturnValue(source);
    const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
      'room',
      { onBlock: vi.fn(), onError: error, onStateChange: state, shouldReconnect: () => false },
      'last',
    );
    source.emit('heartbeat');
    source.emit('stream_end');
    source.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(600_000);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith('paused');
    expect(error).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    subscription.close();
    vi.useRealTimers();
  });
  it('keeps an active or approval-pending run receiving rotations for more than ten minutes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const sources: ReturnType<typeof lifecycleSource>[] = [];
    const factory = vi.fn(() => {
      const source = lifecycleSource();
      sources.push(source);
      return source;
    });
    const error = vi.fn();
    const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
      'room',
      { onBlock: vi.fn(), onError: error, onStateChange: vi.fn(), shouldReconnect: () => true },
      'cursor',
    );
    for (let rotation = 0; rotation < 4; rotation++) {
      const source = sources.at(-1);
      for (let heartbeat = 0; heartbeat < 16; heartbeat++) {
        source?.emit('heartbeat');
        await vi.advanceTimersByTimeAsync(15_000);
      }
      source?.emit('stream_end');
      source?.onerror?.(new Event('error'));
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(factory).toHaveBeenCalledTimes(5);
    expect(factory).toHaveBeenLastCalledWith(
      '/api/core/rooms/room/message-blocks/stream?cursor=cursor',
    );
    expect(error).not.toHaveBeenCalled();
    subscription.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it('stops after five consecutive failures and resets the count on a heartbeat', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const sources: ReturnType<typeof lifecycleSource>[] = [];
    const factory = vi.fn(() => {
      const source = lifecycleSource();
      sources.push(source);
      return source;
    });
    const error = vi.fn();
    const state = vi.fn();
    const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
      'room',
      { onBlock: vi.fn(), onError: error, onStateChange: state },
    );
    sources.at(-1)?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    sources.at(-1)?.emit('heartbeat');
    for (let attempt = 0; attempt < 5; attempt++) {
      sources.at(-1)?.onerror?.(new Event('error'));
      await vi.advanceTimersByTimeAsync(1_000 * 2 ** attempt);
    }
    expect(factory).toHaveBeenCalledTimes(6);
    expect(state).toHaveBeenLastCalledWith('failed');
    expect(error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(factory).toHaveBeenCalledTimes(6);
    subscription.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it('detects missing heartbeats after 45 seconds and retries with the last delivered cursor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const source = lifecycleSource();
    const factory = vi.fn().mockReturnValue(source);
    const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
      'room',
      { onBlock: vi.fn(), onError: vi.fn(), onStateChange: vi.fn() },
      'cursor',
    );
    await vi.advanceTimersByTimeAsync(44_999);
    expect(source.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(source.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(factory).toHaveBeenCalledTimes(2);
    subscription.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it('treats oversized frames as non-retryable', async () => {
    vi.useFakeTimers();
    const source = lifecycleSource();
    const factory = vi.fn().mockReturnValue(source);
    const error = vi.fn();
    const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
      'room',
      { onBlock: vi.fn(), onError: error, onStateChange: vi.fn() },
    );
    source.emit('stream_error', '{"code":"FRAME_TOO_LARGE","retryable":false}');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    subscription.close();
    vi.useRealTimers();
  });
});

it('reports capacity and authentication failures without hiding HTTP status or retrying', async () => {
  vi.useFakeTimers();
  for (const status of [401, 429]) {
    const response = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status }));
    const error = vi.fn();
    const state = vi.fn();
    const subscription = new EventSourceMessageBlockProgressService('/api/core').subscribe('room', {
      onBlock: vi.fn(),
      onError: error,
      onStateChange: state,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status }));
    expect(state).toHaveBeenLastCalledWith('failed');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(response).toHaveBeenCalledTimes(1);
    subscription.close();
    response.mockRestore();
  }
  vi.useRealTimers();
});
