import { NextRequest, NextResponse } from 'next/server';

import { verifyServerSessionSubject } from '@/di/server-auth';
import { createProxyTransport, messageBlockProxyAdmission } from '@/di/server-streams';
import { CSRF_COOKIE, sessionCookieName } from '@/src/entities/models/session';
import { logProxyTransportFailure } from '@/app/api/_shared/proxy-error-log';
import { logWebClientError } from '@/app/api/_shared/web-client-error-log';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const session = request.cookies.get(sessionCookieName())?.value;
  if (session === undefined)
    return logWebClientError(
      request,
      NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } },
        { status: 401 },
      ),
    );
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
  const messageBlocks =
    request.method === 'GET' &&
    path.length === 4 &&
    path[0]?.toLowerCase() === 'rooms' &&
    Boolean(path[1]) &&
    path[2]?.toLowerCase() === 'message-blocks' &&
    path[3]?.toLowerCase() === 'stream';
  let release: (() => void) | undefined;
  if (messageBlocks) {
    let subject: string;
    try {
      subject = await verifyServerSessionSubject(session);
    } catch {
      return logWebClientError(
        request,
        NextResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } },
          { status: 401 },
        ),
      );
    }
    const slot = messageBlockProxyAdmission.acquire(subject);
    if (typeof slot === 'string')
      return logWebClientError(
        request,
        NextResponse.json(
          { error: { code: 'STREAM_CAPACITY_EXCEEDED', scope: slot } },
          { status: 429, headers: { 'Retry-After': '10' } },
        ),
      );
    release = slot;
  }
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  const startedAt = performance.now();
  if (messageBlocks)
    console.info(
      JSON.stringify({
        event: 'core_proxy_stream_started',
        requestId,
        roomId: path[1],
        occurredAt: new Date().toISOString(),
      }),
    );
  const transport = createProxyTransport(
    request.signal,
    release,
    messageBlocks ? (reason) => messageBlockProxyAdmission.closed(reason) : undefined,
    messageBlocks,
    messageBlocks
      ? (reason) => {
          const entry = JSON.stringify({
            event: 'core_proxy_stream_closed',
            requestId,
            roomId: path[1],
            reason,
            durationMs: Math.round(performance.now() - startedAt),
            occurredAt: new Date().toISOString(),
          });
          if (reason === 'error') console.warn(entry);
          else console.info(entry);
        }
      : undefined,
  );
  try {
    const base = requiredCoreUrl();
    const target = new URL(`${base}/${path.map(encodeURIComponent).join('/')}`);
    target.search = request.nextUrl.search;
    const headers = new Headers(request.headers);
    headers.set('X-Request-Id', requestId);
    headers.set('Authorization', `Bearer ${session}`);
    headers.delete('cookie');
    headers.delete('host');
    headers.delete('content-length');
    headers.delete('x-celesnity-organization-id');
    const upstream = await fetch(target, {
      method: request.method,
      signal: transport.signal,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await request.arrayBuffer(),
    });
    if (messageBlocks)
      console.info(
        JSON.stringify({
          event: 'core_proxy_stream_upstream_response',
          requestId,
          roomId: path[1],
          status: upstream.status,
          durationMs: Math.round(performance.now() - startedAt),
          occurredAt: new Date().toISOString(),
        }),
      );
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('X-Request-Id', upstream.headers.get('X-Request-Id') ?? requestId);
    responseHeaders.delete('set-cookie');
    responseHeaders.delete('transfer-encoding');
    if (upstream.ok && isStreamingPath(request.method, path)) {
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
  } catch (error) {
    const cancelled = request.signal.aborted || transport.signal.aborted;
    transport.finish(cancelled ? 'disconnected' : 'error');
    if (cancelled) return new NextResponse(null, { status: 499 });
    logProxyTransportFailure({ target: 'core', method: request.method, path, requestId });
    throw error;
  }
}

function isStreamingPath(method: string, path: readonly string[]): boolean {
  return (
    method === 'GET' &&
    (path.at(-1) === 'stream' ||
      (path.length === 5 &&
        path[0] === 'automation-workflows' &&
        path[2] === 'runs' &&
        path[4] === 'events'))
  );
}

function operationalEndpointUnavailable(): NextResponse {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } },
    { status: 404 },
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

function requiredCoreUrl(): string {
  const value = process.env.CORE_API_URL?.replace(/\/+$/u, '');
  if (value === undefined || value === '') throw new Error('CORE_API_URL is required');
  return value;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
