import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyServerSessionSubject } = vi.hoisted(() => ({
  verifyServerSessionSubject: vi.fn().mockResolvedValue('verified-subject'),
}));
vi.mock('@/di/server-auth', () => ({ verifyServerSessionSubject }));

import { GET } from '@/app/api/core/[...path]/route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('core API gateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CORE_API_URL = 'http://celesnity-core.celesnity.svc.cluster.local:3001/api/v1';
  });

  it('does not expose the internal Prometheus endpoint', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/core/metrics', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['metrics']),
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns a successful Core response instead of an empty Web response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rooms: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/core/rooms', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['rooms']),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ rooms: [] });
  });

  it('preserves a successful no-content response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/core/rooms', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['rooms']),
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('returns workflow events as an unbuffered SSE response', async () => {
    const upstreamBody = new ReadableStream<Uint8Array>({
      type: 'bytes',
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: snapshot\ndata: {}\n\n'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(upstreamBody, { headers: { 'content-type': 'text/event-stream' } }),
    );
    const response = await GET(
      new NextRequest(
        'https://dev.celesnity.com/api/core/automation-workflows/wf-1/runs/run-1/events',
        { headers: { cookie: '__Host-celesnity_session=verified-cookie' } },
      ),
      context(['automation-workflows', 'wf-1', 'runs', 'run-1', 'events']),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    if (response.body === null) throw new Error('Expected a stream body');
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot');
    await reader.cancel();
  });

  it('cancels the upstream fetch when the browser disconnects', async () => {
    const abort = new AbortController();
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          });
        }),
    );
    const failureLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending = GET(
      new NextRequest('https://dev.celesnity.com/api/core/rooms', {
        signal: abort.signal,
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['rooms']),
    );
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
    abort.abort();

    expect((await pending).status).toBe(499);
    expect(failureLog).not.toHaveBeenCalled();
  });

  it('logs a redacted transport failure with the forwarded request ID', async () => {
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('secret upstream URL'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = new NextRequest('https://dev.celesnity.com/api/core/connections', {
      headers: {
        cookie: '__Host-celesnity_session=verified-cookie',
        'x-request-id': 'web-request-1',
      },
    });

    await expect(GET(request, context(['connections']))).rejects.toThrow('secret upstream URL');

    const forwardedHeaders = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(forwardedHeaders.get('x-request-id')).toBe('web-request-1');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('"event":"core_proxy_request_failed"'),
    );
    expect(errorLog.mock.calls[0]?.[0]).not.toContain('secret upstream URL');
  });

  it('logs a Web-owned 401 without leaking credentials or request query', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/core/connections?token=secret'),
      context(['connections']),
    );

    expect(response.status).toBe(401);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"status":401'));
    expect(warning.mock.calls[0]?.[0]).not.toContain('secret');
  });

  it('leaves an upstream 403 to the Core alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/core/sql-executions', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['sql-executions']),
    );

    expect(response.status).toBe(403);
    expect(warning).not.toHaveBeenCalled();
  });
});

it('authenticates before allocating slots and preserves upstream auth failures as JSON', async () => {
  verifyServerSessionSubject.mockRejectedValueOnce(new Error('expired cookie'));
  const upstream = vi.spyOn(globalThis, 'fetch');
  const request = () =>
    new NextRequest('https://dev.celesnity.com/api/core/rooms/room/message-blocks/stream', {
      headers: { cookie: '__Host-celesnity_session=verified-cookie', accept: 'text/event-stream' },
    });
  const denied = await GET(request(), context(['rooms', 'room', 'message-blocks', 'stream']));
  expect(denied.status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
  const bytes = new TextEncoder().encode('{"error":{"code":"UNAUTHENTICATED"}}');
  upstream.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        type: 'bytes',
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  const response = await GET(request(), context(['rooms', 'room', 'message-blocks', 'stream']));
  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toBe('application/json');
  expect(await response.json()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
});

it('rejects a ninth stream before upstream fetch while existing streams remain open', async () => {
  const cancels: ReturnType<typeof vi.fn>[] = [];
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const cancel = vi.fn();
    cancels.push(cancel);
    return new Response(new ReadableStream({ type: 'bytes', cancel }), {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const open = () =>
    GET(
      new NextRequest('https://dev.celesnity.com/api/core/rooms/room/message-blocks/stream', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['rooms', 'room', 'message-blocks', 'stream']),
    );
  const streams = await Promise.all(Array.from({ length: 8 }, open));
  const rejected = await open();
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get('retry-after')).toBe('10');
  expect(fetch).toHaveBeenCalledTimes(8);
  expect(cancels.every((cancel) => cancel.mock.calls.length === 0)).toBe(true);
  await streams[0]?.body?.cancel();
  const replacement = await open();
  expect(replacement.status).toBe(200);
  await Promise.all([...streams.slice(1), replacement].map((response) => response.body?.cancel()));
});

it('logs a correlated message-block stream close once after cancellation', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(new ReadableStream({ type: 'bytes' }), {
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  const response = await GET(
    new NextRequest('https://dev.celesnity.com/api/core/rooms/room/message-blocks/stream', {
      headers: {
        cookie: '__Host-celesnity_session=verified-cookie',
        'x-request-id': 'stream-request-1',
      },
    }),
    context(['rooms', 'room', 'message-blocks', 'stream']),
  );
  expect(response.status).toBe(200);
  expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).get('x-request-id')).toBe(
    'stream-request-1',
  );
  expect(response.headers.get('x-request-id')).toBe('stream-request-1');
  await response.body?.cancel();
  const closeEntries = info.mock.calls
    .map(([value]) => (typeof value === 'string' ? JSON.parse(value) : undefined))
    .filter((entry) => entry?.event === 'core_proxy_stream_closed');
  expect(closeEntries).toEqual([
    expect.objectContaining({
      requestId: 'stream-request-1',
      roomId: 'room',
      reason: 'disconnected',
    }),
  ]);
});
