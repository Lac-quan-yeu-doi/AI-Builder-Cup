import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EventSourceMessageBlockProgressService,
  type MessageBlockEventSourceClient,
} from '@/src/infrastructure/services/event-source-message-block-progress.service';

function event(id: string): MessageEvent<string> {
  return {
    data: JSON.stringify({
      id,
      room_id: 'room-1',
      run_id: 'run-1',
      block_type: 'chart',
      version: 1,
      payload: { kind: 'preview' },
      fallback_text: 'Chart preview',
      published_at: '2026-09-14T10:42:32Z',
    }),
  } as MessageEvent<string>;
}

function setup(cursor?: string) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const sources: MessageBlockEventSourceClient[] = [];
  const urls: string[] = [];
  const onBlock = vi.fn();
  const service = new EventSourceMessageBlockProgressService('/api/core', (url) => {
    urls.push(url);
    const source: MessageBlockEventSourceClient = {
      onmessage: null,
      onerror: null,
      close: vi.fn(),
    };
    sources.push(source);
    return source;
  });
  const subscription = service.subscribe('room-1', { onBlock, onError: vi.fn() }, cursor);
  return { sources, urls, onBlock, subscription };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('message block stream recovery', () => {
  it('receives a chart created after the initial connection times out', () => {
    const { sources, onBlock, subscription } = setup();
    vi.advanceTimersByTime(30_000);
    sources[0]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    sources[1]?.onmessage?.(event('chart-after-timeout'));
    expect(onBlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'chart-after-timeout' }));
    subscription.close();
  });

  it('resumes after the last received block, not the initial history cursor', () => {
    const { sources, urls, subscription } = setup('history-block');
    sources[0]?.onmessage?.(event('live-block'));
    sources[0]?.onmessage?.({ data: 'bad json' } as MessageEvent<string>);
    sources[0]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    expect(urls[1]).toBe('/api/core/rooms/room-1/message-blocks/stream?cursor=live-block');
    subscription.close();
  });

  it('preserves the history cursor if the connection failed before receiving a block', () => {
    const { sources, urls, subscription } = setup('history-block');
    sources[0]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    expect(urls[1]).toBe('/api/core/rooms/room-1/message-blocks/stream?cursor=history-block');
    subscription.close();
  });

  it('backs off repeated failures and stops retries on close', () => {
    const { sources, urls, subscription } = setup();
    sources[0]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    sources[1]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    expect(urls).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(urls).toHaveLength(3);
    sources[2]?.onerror?.(new Event('error'));
    subscription.close();
    subscription.close();
    vi.advanceTimersByTime(60_000);
    expect(urls).toHaveLength(3);
  });

  it('ignores callbacks from an obsolete connection', () => {
    const { sources, onBlock, subscription } = setup();
    const staleMessage = sources[0]?.onmessage;
    sources[0]?.onerror?.(new Event('error'));
    vi.advanceTimersByTime(1_000);
    staleMessage?.(event('stale'));
    sources[1]?.onmessage?.(event('current'));
    expect(onBlock.mock.calls.map(([block]) => block.id)).toEqual(['current']);
    subscription.close();
  });
});
