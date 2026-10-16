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
