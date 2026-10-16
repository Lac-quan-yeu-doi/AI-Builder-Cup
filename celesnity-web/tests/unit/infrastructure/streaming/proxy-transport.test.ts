import { describe, expect, it, vi } from 'vitest';
import {
  createProxyTransport,
  MessageBlockProxyAdmission,
} from '@/src/infrastructure/streaming/proxy-transport';

describe('Web message-block admission', () => {
  it('permits eight verified-subject streams, rejects the ninth, and reuses released slots', () => {
    const admission = new MessageBlockProxyAdmission();
    const slots = Array.from({ length: 8 }, () => admission.acquire('subject'));
    expect(slots.every((slot) => typeof slot === 'function')).toBe(true);
    expect(admission.acquire('subject')).toBe('subject');
    const first = slots[0];
    if (typeof first === 'function') {
      first();
      first();
    }
    expect(typeof admission.acquire('subject')).toBe('function');
    expect(admission.snapshot().active).toBe(8);
  });
  it('enforces the pod cap across subjects independently', () => {
    const admission = new MessageBlockProxyAdmission();
    const releases = Array.from({ length: 64 }, (_, index) =>
      admission.acquire(`subject-${index}`),
    );
    expect(admission.acquire('another')).toBe('pod');
    for (const release of releases) if (typeof release === 'function') release();
    expect(admission.snapshot().active).toBe(0);
  });
});

describe('Shared proxy transport', () => {
  it('propagates downstream abort to upstream fetch and its reader, releasing once', async () => {
    const downstream = new AbortController();
    const release = vi.fn();
    const cancel = vi.fn();
    const record = vi.fn();
    const transport = createProxyTransport(downstream.signal, release, record, true);
    const body = new ReadableStream<Uint8Array>({ type: 'bytes', cancel });
    const relay = transport.relay(body);
    downstream.abort();
    await Promise.resolve();
    expect(transport.signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('disconnected');
    await relay?.cancel().catch(() => undefined);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('cancels upstream on response-body cancellation even without request abort', async () => {
    const cancel = vi.fn();
    const release = vi.fn();
    const transport = createProxyTransport(new AbortController().signal, release, undefined, true);
    const relay = transport.relay(new ReadableStream<Uint8Array>({ type: 'bytes', cancel }));
    await relay?.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(transport.signal.aborted).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('bounds reads to 16 KiB and stops pulling after 48 KiB is queued', async () => {
    let bytes = 0;
    const transport = createProxyTransport(
      new AbortController().signal,
      undefined,
      undefined,
      true,
    );
    const relay = transport.relay(
      new ReadableStream<Uint8Array>({
        type: 'bytes',
        pull(controller) {
          const request = (controller as ReadableByteStreamController).byobRequest;
          expect(request?.view?.byteLength).toBeLessThanOrEqual(16 * 1024);
          const length = request?.view?.byteLength ?? 0;
          bytes += length;
          request?.respond(length);
        },
      }),
    );
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(bytes).toBe(48 * 1024);
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(bytes).toBe(48 * 1024);
    await relay?.cancel();
  });
  it('releases after normal upstream completion and retains status bodies', async () => {
    const release = vi.fn();
    const record = vi.fn();
    const transport = createProxyTransport(new AbortController().signal, release, record);
    const body = new Response('error details').body;
    const result = await new Response(transport.relay(body)).text();
    expect(result).toBe('error details');
    expect(release).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('completed');
    expect(transport.signal.aborted).toBe(false);
  });
  it('reports a final close reason exactly once after downstream cancellation', async () => {
    const reason = vi.fn();
    const release = vi.fn();
    const transport = createProxyTransport(
      new AbortController().signal,
      release,
      undefined,
      true,
      reason,
    );
    const relay = transport.relay(new ReadableStream<Uint8Array>({ type: 'bytes' }));
    await relay?.cancel();
    transport.finish('completed');
    expect(reason).toHaveBeenCalledExactlyOnceWith('disconnected');
    expect(release).toHaveBeenCalledTimes(1);
  });
});

it('releases active readers and slots on process shutdown without cancelling durable execution', async () => {
  const { cancelProxyTransports } = await import('@/src/infrastructure/streaming/proxy-transport');
  const release = vi.fn();
  const record = vi.fn();
  const cancel = vi.fn();
  const transport = createProxyTransport(new AbortController().signal, release, record, true);
  const body = transport.relay(new ReadableStream({ type: 'bytes', cancel }));
  cancelProxyTransports();
  await Promise.resolve();
  expect(transport.signal.aborted).toBe(true);
  expect(release).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith('shutdown');
  expect(cancel).toHaveBeenCalledTimes(1);
  await body?.cancel().catch(() => undefined);
  expect(release).toHaveBeenCalledTimes(1);
});
