import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadWorkspaceAccess, verifyServerSessionSubject } = vi.hoisted(() => ({
  loadWorkspaceAccess: vi.fn(),
  verifyServerSessionSubject: vi.fn(),
}));

vi.mock('@/di/server-auth', () => ({ loadWorkspaceAccess, verifyServerSessionSubject }));

import { GET, POST } from '@/app/api/agent/[...path]/route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('agent API gateway', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    verifyServerSessionSubject.mockReset();
    loadWorkspaceAccess.mockReset();
    loadWorkspaceAccess.mockResolvedValue(null);
    process.env.AGENT_API_URL = 'http://minder-serve.minder.svc.cluster.local:8080/api/v2';
    process.env.CORE_API_URL = 'http://core.internal';
    process.env.WEB_ORIGIN = 'https://dev.celesnity.com';
  });

  it('rejects a request without a Web session', async () => {
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/healthz'),
      context(['healthz']),
    );
    expect(response.status).toBe(401);
    expect(verifyServerSessionSubject).not.toHaveBeenCalled();
  });

  it('forwards only the Core-issued identity before forwarding', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/administration/minder-principal-assertion')
          ? new Response(JSON.stringify({ token: 'minder-assertion' }), { status: 201 })
          : new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/healthz?detail=1', {
        headers: {
          authorization: 'Bearer attacker-token',
          cookie: '__Host-celesnity_session=verified-cookie',
          'x-caller-id': 'attacker-controlled',
          'x-celesnity-organization-id': 'attacker-organization',
        },
      }),
      context(['healthz']),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(verifyServerSessionSubject).toHaveBeenCalledWith('verified-cookie');
    const [target, init] = upstream.mock.calls[1] ?? [];
    expect(String(target)).toBe(
      'http://minder-serve.minder.svc.cluster.local:8080/api/v2/healthz?detail=1',
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer minder-assertion');
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.has('x-caller-id')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('x-celesnity-organization-id')).toBe(false);
  });

  it('exchanges the Web session for a Minder assertion before forwarding', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/administration/minder-principal-assertion')) {
        return new Response(JSON.stringify({ token: 'minder-assertion' }), { status: 201 });
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });

    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/healthz', {
        headers: {
          authorization: 'Bearer attacker-token',
          cookie: '__Host-celesnity_session=verified-cookie',
          'x-caller-id': 'attacker-controlled',
          'x-celesnity-organization-id': 'attacker-organization',
          'x-forwarded-for': 'attacker-forwarded-for',
          forwarded: 'for=attacker;host=evil.example;proto=http',
        },
      }),
      context(['healthz']),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [coreTarget, coreInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(coreTarget)).toBe(
      'http://core.internal/administration/minder-principal-assertion',
    );
    expect(new Headers(coreInit?.headers).get('authorization')).toBe('Bearer verified-cookie');
    const coreRequestId = new Headers(coreInit?.headers).get('x-request-id');
    const [, agentInit] = fetchMock.mock.calls[1] ?? [];
    const agentHeaders = new Headers(agentInit?.headers);
    expect(agentHeaders.get('authorization')).toBe('Bearer minder-assertion');
    expect(coreRequestId).toBe(agentHeaders.get('x-request-id'));
    expect(agentHeaders.has('x-caller-id')).toBe(false);
    expect(agentHeaders.has('x-celesnity-organization-id')).toBe(false);
    expect(agentHeaders.has('x-forwarded-for')).toBe(false);
    expect(agentHeaders.has('forwarded')).toBe(false);
  });

  it('fails closed when Core returns a malformed assertion response', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ unexpected: 'payload' }), { status: 201 }));

    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/healthz', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['healthz']),
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('propagates Core assertion failures without contacting Minder', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), { status: 403 }),
      );

    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/healthz', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['healthz']),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not expose the internal Prometheus endpoint', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/metrics', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['metrics']),
    );

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects Home agent routes when Home is not visible', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    loadWorkspaceAccess.mockResolvedValue(['ANALYTICS']);
    const upstream = vi.spyOn(globalThis, 'fetch');

    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/rooms', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['rooms']),
    );

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('allows tenant-scoped agent metadata reads with Home access', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    loadWorkspaceAccess.mockResolvedValue(['HOME']);
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/administration/minder-principal-assertion')
          ? new Response(JSON.stringify({ token: 'minder-assertion' }), { status: 201 })
          : new Response(JSON.stringify([{ name: 'writer' }]), { status: 200 }),
      );

    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/agent-manifests', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['agent-manifests']),
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('allows Home users to validate a manifest without administration access', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    loadWorkspaceAccess.mockResolvedValue(['HOME']);
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).endsWith('/administration/minder-principal-assertion')
          ? new Response(JSON.stringify({ token: 'minder-assertion' }), { status: 201 })
          : new Response(JSON.stringify({ valid: true }), { status: 200 }),
      );

    const response = await POST(
      new NextRequest('https://dev.celesnity.com/api/agent/agent-manifests/validate', {
        method: 'POST',
        headers: {
          cookie: '__Host-celesnity_session=verified-cookie; celesnity_csrf=csrf-value',
          origin: 'https://dev.celesnity.com',
          'x-csrf-token': 'csrf-value',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ yaml: 'name: writer' }),
      }),
      context(['agent-manifests', 'validate']),
    );

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('fails closed for an unknown agent route mapping', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await GET(
      new NextRequest('https://dev.celesnity.com/api/agent/future-endpoint', {
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
      }),
      context(['future-endpoint']),
    );
    expect(response.status).toBe(403);
    expect(loadWorkspaceAccess).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('requires Analytics for chart-encoding inference turns', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    loadWorkspaceAccess.mockResolvedValue(['HOME']);
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await POST(
      new NextRequest('https://dev.celesnity.com/api/agent/runs', {
        method: 'POST',
        headers: {
          cookie: '__Host-celesnity_session=verified-cookie; celesnity_csrf=csrf-value',
          origin: 'https://dev.celesnity.com',
          'x-csrf-token': 'csrf-value',
        },
        body: JSON.stringify({ agent: 'chart-encoding-inference' }),
      }),
      context(['runs']),
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects a mutation without a matching CSRF token and allowed origin', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const upstream = vi.spyOn(globalThis, 'fetch');
    const response = await POST(
      new NextRequest('https://dev.celesnity.com/api/agent/rooms', {
        method: 'POST',
        headers: { cookie: '__Host-celesnity_session=verified-cookie' },
        body: '{}',
      }),
      context(['rooms']),
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards a valid same-origin mutation', async () => {
    verifyServerSessionSubject.mockResolvedValue('firebase-subject');
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/administration/minder-principal-assertion')
        ? new Response(JSON.stringify({ token: 'minder-assertion' }), { status: 201 })
        : new Response(JSON.stringify({ id: 'room-1' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
    );
    const response = await POST(
      new NextRequest('https://dev.celesnity.com/api/agent/rooms', {
        method: 'POST',
        headers: {
          cookie: '__Host-celesnity_session=verified-cookie; celesnity_csrf=csrf-value',
          origin: 'https://dev.celesnity.com',
          'x-csrf-token': 'csrf-value',
        },
        body: '{}',
      }),
      context(['rooms']),
    );
    expect(response.status).toBe(201);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
