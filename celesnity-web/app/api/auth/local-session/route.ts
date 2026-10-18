import { randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createLocalDevelopmentSession } from '@/di/server-auth';
import { logWebClientError } from '@/app/api/_shared/web-client-error-log';
import {
  CSRF_COOKIE,
  LOCAL_DEVELOPMENT_PERSONAS,
  sessionCookieName,
  SESSION_MAX_AGE_SECONDS,
} from '@/src/entities/models/session';

const requestSchema = z.object({ persona: z.enum(LOCAL_DEVELOPMENT_PERSONAS) });

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) {
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Invalid origin.' }, { status: 403 }),
    );
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Invalid local development persona.' }, { status: 400 }),
    );
  }
  try {
    const session = createLocalDevelopmentSession(parsed.data.persona);
    const csrf = randomBytes(32).toString('base64url');
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(
      sessionCookieName(),
      session,
      cookieOptions(true, request.nextUrl.protocol),
    );
    response.cookies.set(CSRF_COOKIE, csrf, cookieOptions(false, request.nextUrl.protocol));
    return response;
  } catch {
    return logWebClientError(
      request,
      NextResponse.json(
        { error: 'Local development authentication is unavailable.' },
        { status: 403 },
      ),
    );
  }
}

/**
 * Signs straight in as the workspace owner, so local development has no login
 * screen. A plain navigation reaches it from the proxy, which is why it is a
 * GET without the origin check: the cookie only ever signs the local persona.
 */
export function GET(request: NextRequest) {
  try {
    const session = createLocalDevelopmentSession('local-owner');
    const csrf = randomBytes(32).toString('base64url');
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
    // A relative Location keeps the browser on the host it used; behind the
    // standalone server, request.url names the bind address (0.0.0.0) instead.
    const response = new NextResponse(null, { status: 307, headers: { Location: returnTo } });
    response.cookies.set(
      sessionCookieName(),
      session,
      cookieOptions(true, request.nextUrl.protocol),
    );
    response.cookies.set(CSRF_COOKIE, csrf, cookieOptions(false, request.nextUrl.protocol));
    return response;
  } catch {
    // No redirect to /login here: in local development it would come straight back.
    return logWebClientError(
      request,
      NextResponse.json(
        { error: 'Local development authentication is unavailable.' },
        { status: 403 },
      ),
    );
  }
}

/** Only a path on this site; anything else, including `//host`, goes home. */
function safeReturnTo(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (value.startsWith('/\\') || value.startsWith('/login')) return '/';
  return value;
}

function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const allowed = (process.env.WEB_ORIGIN ?? request.nextUrl.origin)
    .split(',')
    .map((value) => value.trim());
  return origin !== null && allowed.includes(origin);
}

function cookieOptions(httpOnly: boolean, protocol: string) {
  return {
    httpOnly,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'strict' as const,
    secure: protocol === 'https:',
  };
}
