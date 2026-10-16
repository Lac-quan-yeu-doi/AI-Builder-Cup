// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EventSourceMessageBlockProgressService,
  type MessageBlockEventSourceClient,
} from '@/src/infrastructure/services/event-source-message-block-progress.service';

const telemetry = vi.hoisted(() => vi.fn());
vi.mock('@/src/infrastructure/observability/client-telemetry', () => ({
  recordMessageBlockStreamEvent: telemetry,
}));

function setup(
  recover: (
    reason: import('@/src/entities/models/message-block-stream').MessageBlockRecoveryReason,
    cursor?: string,
  ) => Promise<import('@/src/entities/models/message-block-stream').MessageBlockRecoveryResult>,
  shouldReconnect?: () => boolean,
) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const sources: (MessageBlockEventSourceClient & { emit(name: string, data?: string): void })[] =
    [];
  const factory = vi.fn(() => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    const source = {
      onmessage: null,
      onerror: null,
      close: vi.fn(),
      addEventListener: (name: string, callback: (event: MessageEvent<string>) => void) => {
        listeners.set(name, callback);
      },
      removeEventListener: (name: string) => {
        listeners.delete(name);
      },
      emit: (name: string, data = '{}') => listeners.get(name)?.(new MessageEvent(name, { data })),
    } as MessageBlockEventSourceClient & { emit(name: string, data?: string): void };
    sources.push(source);
    return source;
  });
  const error = vi.fn();
  const state = vi.fn();
  const observer = {
    onBlock: vi.fn(),
    onError: error,
    onStateChange: state,
    recover,
    shouldReconnect,
  };
  const subscription = new EventSourceMessageBlockProgressService('/api/core', factory).subscribe(
    'room',
    observer,
    'old',
  );
  return { factory, sources, error, state, subscription };
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  telemetry.mockClear();
});
const reset = '{"code":"MESSAGE_BLOCK_CURSOR_INVALID","recovery":"reload_room_state"}';

describe('message-block restoration policy', () => {
  it('waits for reset EOF and restoration before opening with the recovered cursor', async () => {
    let resolve: ((value: { cursor: string; resume: boolean }) => void) | undefined;
    const recover = vi.fn(
      () =>
        new Promise<{ cursor: string; resume: boolean }>((done) => {
          resolve = done;
        }),
    );
    const t = setup(recover);
    t.sources[0]?.emit('stream_reset', reset);
    expect(recover).not.toHaveBeenCalled();
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(recover).toHaveBeenCalledWith('cursor_reset', undefined);
    expect(t.factory).toHaveBeenCalledTimes(1);
    resolve?.({ cursor: 'restored', resume: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.factory).toHaveBeenLastCalledWith(
      '/api/core/rooms/room/message-blocks/stream?cursor=restored',
    );
    expect(t.error).not.toHaveBeenCalled();
    t.subscription.close();
  });
  it('restores authoritative state after a transport failure and pauses if idle', async () => {
    const recover = vi.fn().mockResolvedValue({ cursor: 'missed', resume: false });
    const t = setup(recover);
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recover).toHaveBeenCalledWith('transport_failure', 'old');
    expect(t.factory).toHaveBeenCalledTimes(1);
    expect(t.state).toHaveBeenLastCalledWith('paused');
    expect(t.error).not.toHaveBeenCalled();
    t.subscription.close();
  });
  it('keeps observing when a run becomes active after the recovery snapshot', async () => {
    let active = false;
    const recover = vi.fn(async () => {
      active = true;
      return { cursor: 'missed', resume: false };
    });
    const t = setup(recover, () => active);
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(t.factory).toHaveBeenCalledTimes(2);
    expect(t.factory).toHaveBeenLastCalledWith(
      '/api/core/rooms/room/message-blocks/stream?cursor=missed',
    );
    expect(t.state).not.toHaveBeenCalledWith('paused');
    t.subscription.close();
  });
  it('allows two reset recoveries and surfaces the third without an infinite loop', async () => {
    const t = setup(vi.fn().mockResolvedValue({ resume: true }));
    for (let n = 0; n < 3; n += 1) {
      t.sources.at(-1)?.emit('stream_reset', reset);
      t.sources.at(-1)?.onerror?.(new Event('error'));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(t.factory).toHaveBeenCalledTimes(3);
    expect(t.error).toHaveBeenCalledTimes(1);
    expect(t.state).toHaveBeenLastCalledWith('failed');
    t.subscription.close();
  });
  it('cannot attach a late recovery after the observer closes', async () => {
    let resolve: ((value: { resume: boolean }) => void) | undefined;
    const t = setup(
      vi.fn(
        () =>
          new Promise<{ resume: boolean }>((done) => {
            resolve = done;
          }),
      ),
    );
    t.sources[0]?.emit('stream_reset', reset);
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    t.subscription.close();
    resolve?.({ resume: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.factory).toHaveBeenCalledTimes(1);
  });
  it('surfaces expired authentication from restoration without reconnecting or exhausting five retries', async () => {
    const failure = new Error('Session expired', { cause: { status: 401 } });
    const t = setup(vi.fn().mockRejectedValue(failure));
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(t.state).toHaveBeenLastCalledWith('failed');
    expect(t.error).toHaveBeenCalledExactlyOnceWith(failure);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.factory).toHaveBeenCalledTimes(1);
    t.subscription.close();
  });
  it('retains the five-failure budget when restoration itself repeatedly fails', async () => {
    const recover = vi.fn().mockRejectedValue(new Error('State unavailable'));
    const t = setup(recover);
    t.sources[0]?.onerror?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recover).toHaveBeenCalledTimes(4);
    expect(t.error).toHaveBeenCalledTimes(1);
    expect(t.state).toHaveBeenLastCalledWith('failed');
    expect(t.factory).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message_block_stream_failed',
        reason: 'retries_exhausted',
        retryCount: 5,
      }),
    );
    t.subscription.close();
  });
  it('carries a browser request ID and records a bounded close reason once', async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream(), {
      headers: { 'X-Request-Id': 'server-request' },
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const sub = new EventSourceMessageBlockProgressService('/api/core').subscribe('room', {
      onBlock: vi.fn(),
      onError: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-request-id')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    const close = sub.close as (reason?: string) => void;
    close('unmount');
    close('room_change');
    const records = telemetry.mock.calls
      .map(([value]) => value)
      .filter((value) => value.event === 'message_block_stream_closed');
    expect(records).toEqual([
      expect.objectContaining({
        reason: 'unmount',
        requestId: 'server-request',
        durationMs: expect.any(Number),
      }),
    ]);
  });
});
