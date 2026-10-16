import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoreApiClient, CoreApiError } from '@/src/infrastructure/api/core-api-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoreApiClient', () => {
  it('keeps the browser global as the receiver of native fetch', async () => {
    const nativeFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      );
    });
    vi.stubGlobal('fetch', nativeFetch);
    const client = new CoreApiClient({ baseUrl: 'https://api-dev.celesnity.com/api/v1' });

    await expect(client.get('/connections')).resolves.toEqual([]);
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });

  it('appends paths and query strings to the configured base URL', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: ['analytics'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchStub);

    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });

    await expect(client.get('/catalogs?include=archived')).resolves.toEqual({
      items: ['analytics'],
    });
    expect(fetchStub).toHaveBeenCalledWith(
      'https://core.example/api/v1/catalogs?include=archived',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it.each(['http://localhost:3001/api/v1', 'http://localhost:3001/api/v1/'])(
    'normalizes base URL %s',
    async (baseUrl) => {
      const fetchImplementation = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const client = new CoreApiClient({ baseUrl, fetchImplementation });

      await client.get('/health/live');

      expect(fetchImplementation).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/health/live',
        expect.objectContaining({ method: 'GET', credentials: 'include' }),
      );
    },
  );

  it('keeps bodyless GET requests simple instead of forcing a CORS preflight', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new CoreApiClient({ fetchImplementation });

    await client.get('/connections');

    const init = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.get('X-Correlation-Id')).toBe(headers.get('X-Request-Id'));
  });

  it('propagates a request ID and returns an SSE response', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response('event: done\ndata: {}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'X-Request-Id': 'backend-1' },
      }),
    );
    const client = new CoreApiClient({ fetchImplementation });

    await expect(client.stream('/rooms/room-1/events?include=deltas')).resolves.toMatchObject({
      status: 200,
    });
    const init = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.get('X-Correlation-Id')).toBe(headers.get('X-Request-Id'));
  });

  it('sends JSON headers and a serialized JSON body', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'connection-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchStub);

    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });
    await client.post(
      '/connections',
      { name: 'Warehouse' },
      { headers: { 'X-Request-Id': 'request-1' } },
    );

    expect(fetchStub).toHaveBeenCalledWith(
      'https://core.example/api/v1/connections',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Warehouse' }),
        credentials: 'include',
      }),
    );
    const init = fetchStub.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request-Id')).toBe('request-1');
  });

  it('does not override the Content-Type of a FormData body, so the browser keeps its multipart boundary', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);
    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });
    const formData = new FormData();
    formData.append('file', new Blob(['a,b\n1,2'], { type: 'text/csv' }), 'data.csv');

    await client.request('/charts/chart-1/data/csv', { method: 'POST', body: formData });

    const init = fetchStub.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(init.body).toBe(formData);
  });

  it('returns undefined for a successful 204 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });

    await expect(client.delete('/connections/connection-1')).resolves.toBeUndefined();
  });

  it('returns undefined for a 2xx response with an empty body, not just 204', async () => {
    // A Nest controller returning `void` from a POST produces an empty body
    // under whatever status that route uses by default (e.g. 201, not 204)
    // — `response.json()` on an empty body throws "Unexpected end of JSON
    // input" rather than something falsy, so this must not regress to that.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('', { status: 201, headers: { 'content-length': '0' } })),
    );
    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });

    await expect(client.post('/rooms/room-1/message-blocks/bind')).resolves.toBeUndefined();
  });

  it('uses the problem detail message for failed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            title: 'Connection conflict',
            detail: 'A connection with this name already exists.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });

    await expect(client.post('/connections', { name: 'Warehouse' })).rejects.toMatchObject({
      name: 'CoreApiError',
      status: 409,
      message: 'A connection with this name already exists.',
    } satisfies Partial<CoreApiError>);
  });

  it('falls back to the status message for malformed non-JSON error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{ malformed', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );
    const client = new CoreApiClient({ baseUrl: 'https://core.example/api/v1' });

    await expect(client.get('/catalogs')).rejects.toEqual(
      new CoreApiError(502, 'Core API request failed with 502'),
    );
  });
});
