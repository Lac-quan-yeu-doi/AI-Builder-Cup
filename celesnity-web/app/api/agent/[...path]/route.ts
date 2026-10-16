import { NextRequest, NextResponse } from 'next/server';

import { createProxyTransport } from '@/di/server-streams';
import { loadWorkspaceAccess, verifyServerSessionSubject } from '@/di/server-auth';
import { CSRF_COOKIE, sessionCookieName } from '@/src/entities/models/session';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';
import { logProxyTransportFailure } from '@/app/api/_shared/proxy-error-log';
import { logWebClientError } from '@/app/api/_shared/web-client-error-log';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const startedAt = performance.now();
  const session = request.cookies.get(sessionCookieName())?.value;
  if (session === undefined) return logWebClientError(request, unauthenticated());

  try {
    await verifyServerSessionSubject(session);
  } catch {
    return logWebClientError(request, unauthenticated());
  }
  if (METHODS_WITH_BODY.has(request.method) && !validMutationRequest(request)) {
    return logWebClientError(
      request,
      NextResponse.json(
        { error: { code: 'CSRF_REJECTED', message: 'CSRF validation failed.' } },
        { status: 403 },
      ),
    );
  }

  const { path } = await context.params;
  if (path.length === 1 && path[0] === 'metrics')
    return logWebClientError(request, operationalEndpointUnavailable());
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const requiredFeature = classifyAgentFeature(request.method, path, body);
  if (requiredFeature === undefined) return logWebClientError(request, featureDenied());
  let visibleFeatures: readonly WorkspaceFeature[] | null;
  try {
    visibleFeatures = await loadWorkspaceAccess(session, request.signal);
  } catch {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    console.warn(
      JSON.stringify({
        event: 'agent_proxy_policy_failed',
        requestId,
        stage: 'workspace_access',
        durationMs: elapsedMilliseconds(startedAt),
        occurredAt: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      { error: { code: 'ACCESS_POLICY_UNAVAILABLE', message: 'Access policy is unavailable.' } },
      { status: 503 },
    );
  }
  if (visibleFeatures !== null && !visibleFeatures.includes(requiredFeature)) {
    return logWebClientError(request, featureDenied());
  }
  const minderAssertion = await exchangeSessionForMinderAssertion(
    session,
    request.signal,
    requestId,
  );
  if (minderAssertion instanceof NextResponse && minderAssertion.status !== 499)
    console.warn(
      JSON.stringify({
        event: 'agent_proxy_policy_failed',
        requestId,
        stage: 'assertion_exchange',
        status: minderAssertion.status,
        durationMs: elapsedMilliseconds(startedAt),
        occurredAt: new Date().toISOString(),
      }),
    );
  if (minderAssertion instanceof NextResponse)
    return minderAssertion.status === 499
      ? minderAssertion
      : logWebClientError(request, minderAssertion);
  const target = new URL(
    `${requiredAgentUrl()}/${path.map((segment) => encodeURIComponent(segment)).join('/')}`,
  );
  target.search = request.nextUrl.search;
  const streaming = isStreamingPath(request.method, path);
  console.info(
    JSON.stringify({
      event: 'agent_proxy_request_started',
      method: request.method,
      path: `/${path.join('/')}`,
      requestId,
      streaming,
    }),
  );

  const headers = new Headers(request.headers);
  headers.set('X-Request-Id', requestId);
  headers.set('Authorization', `Bearer ${minderAssertion}`);
  headers.delete('x-caller-id');
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('x-celesnity-organization-id');
  headers.delete('x-celesnity-identity-id');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('forwarded');
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith('x-forwarded-')) headers.delete(name);
  }

  const transport = createProxyTransport(
    request.signal,
    undefined,
    undefined,
    false,
    streaming
      ? (reason) => {
          const entry = JSON.stringify({
            event: 'agent_proxy_stream_closed',
            requestId,
            reason,
            durationMs: elapsedMilliseconds(startedAt),
            occurredAt: new Date().toISOString(),
          });
          if (reason === 'error') console.warn(entry);
          else console.info(entry);
        }
      : undefined,
  );
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      signal: transport.signal,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      body,
    });
  } catch (error: unknown) {
    const cancelled = request.signal.aborted || transport.signal.aborted;
    transport.finish(cancelled ? 'disconnected' : 'error');
    if (cancelled) return new NextResponse(null, { status: 499 });
    logProxyTransportFailure({
      target: 'agent',
      method: request.method,
      path,
      requestId,
      durationMs: elapsedMilliseconds(startedAt),
    });
    throw error;
  }
  console.info(
    JSON.stringify({
      event: 'agent_proxy_request_completed',
      method: request.method,
      path: `/${path.join('/')}`,
      requestId,
      status: upstream.status,
      contentType: upstream.headers.get('content-type'),
      durationMs: elapsedMilliseconds(startedAt),
    }),
  );
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.set('X-Request-Id', requestId);
  responseHeaders.set('X-Correlation-Id', requestId);
  if (upstream.ok && streaming) {
    responseHeaders.delete('content-length');
    responseHeaders.delete('content-encoding');
    responseHeaders.set('Cache-Control', 'no-cache, no-store, no-transform');
    responseHeaders.set('Content-Type', 'text/event-stream; charset=utf-8');
    responseHeaders.set('Connection', 'keep-alive');
    responseHeaders.set('X-Accel-Buffering', 'no');
  } else {
    responseHeaders.set('Cache-Control', 'no-store');
  }
  return new NextResponse(transport.relay(upstream.body), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

async function exchangeSessionForMinderAssertion(
  session: string,
  signal: AbortSignal,
  requestId: string,
): Promise<string | NextResponse> {
  const base = process.env.CORE_API_URL?.replace(/\/+$/u, '');
  if (base === undefined || base === '') throw new Error('CORE_API_URL is required');
  let response: Response;
  try {
    response = await fetch(`${base}/administration/minder-principal-assertion`, {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${session}`, 'X-Request-Id': requestId },
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    if (signal.aborted) return new NextResponse(null, { status: 499 });
    return NextResponse.json(
      { error: { code: 'CORE_AUTH_UNAVAILABLE', message: 'Core authentication is unavailable.' } },
      { status: 503 },
    );
  }
  if (!response.ok) {
    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
    });
  }
  const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || body.token.trim() === '') {
    return NextResponse.json(
      { error: { code: 'CORE_AUTH_INVALID', message: 'Core returned an invalid assertion.' } },
      { status: 502 },
    );
  }
  return body.token;
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function isStreamingPath(method: string, path: readonly string[]): boolean {
  return method === 'GET' && (path.at(-1) === 'events' || path.at(-1) === 'stream');
}

function classifyAgentFeature(
  method: string,
  path: readonly string[],
  body: ArrayBuffer | undefined,
): WorkspaceFeature | undefined {
  const root = path[0];
  if (root === 'agents' || root === 'agent-manifests') {
    if (method === 'GET' || method === 'HEAD') return 'HOME';
    if (root === 'agent-manifests' && method === 'POST' && path[1] === 'validate') return 'HOME';
    return 'ADMINISTRATION';
  }
  if (root === 'skills' || root === 'stats') {
    return 'ADMINISTRATION';
  }
  if (
    ((root === 'turns' && path[1] === 'blocking') || (root === 'runs' && method === 'POST')) &&
    body !== undefined
  ) {
    try {
      const payload: unknown = JSON.parse(new TextDecoder().decode(body));
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'agent' in payload &&
        payload.agent === 'chart-encoding-inference'
      ) {
        return 'ANALYTICS';
      }
    } catch {
      return undefined;
    }
  }
  if (
    root === 'healthz' ||
    root === 'catalog' ||
    root === 'turns' ||
    root === 'rooms' ||
    root === 'sessions' ||
    root === 'runs'
  ) {
    return 'HOME';
  }
  return undefined;
}

function featureDenied(): NextResponse {
  return NextResponse.json(
    { error: { code: 'FEATURE_ACCESS_DENIED', message: 'Feature access is denied.' } },
    { status: 403 },
  );
}

function operationalEndpointUnavailable(): NextResponse {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } },
    { status: 404 },
  );
}

function unauthenticated(): NextResponse {
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } },
    { status: 401 },
  );
}

function validMutationRequest(request: NextRequest): boolean {
  const header = request.headers.get('x-csrf-token');
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  const origin = request.headers.get('origin');
  const allowedOrigins = (process.env.WEB_ORIGIN ?? request.nextUrl.origin)
    .split(',')
    .map((value) => value.trim());
  return (
    header !== null &&
    header !== '' &&
    cookie !== undefined &&
    cookie !== '' &&
    header === cookie &&
    origin !== null &&
    allowedOrigins.includes(origin)
  );
}

function requiredAgentUrl(): string {
  const value = process.env.AGENT_API_URL?.replace(/\/+$/u, '');
  if (value === undefined || value === '') throw new Error('AGENT_API_URL is required');
  return value;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
