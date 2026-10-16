import { randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { tenantAuth, tenantAuthForToken, organizationLoginContext } from '@/di/server-auth';
import { logWebClientError } from '@/app/api/_shared/web-client-error-log';
import {
  CSRF_COOKIE,
  sessionCookieName,
  SESSION_MAX_AGE_SECONDS,
} from '@/src/entities/models/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!validOrigin(request))
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Invalid origin.' }, { status: 403 }),
    );
  const body = (await request.json()) as { idToken?: unknown; organizationSlug?: unknown };
  if (
    typeof body.idToken !== 'string' ||
    body.idToken.length > 8192 ||
    typeof body.organizationSlug !== 'string' ||
    !/^[a-z][a-z0-9-]{1,62}$/u.test(body.organizationSlug)
  )
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Invalid identity token.' }, { status: 400 }),
    );
  let loginContext: Awaited<ReturnType<typeof organizationLoginContext>>;
  try {
    loginContext = await organizationLoginContext(body.organizationSlug);
  } catch {
    return NextResponse.json(
      { error: 'Organization security policy is unavailable.' },
      { status: 503 },
    );
  }
  const auth = tenantAuth(loginContext.identityTenantId);
  let decoded;
  try {
    decoded = await auth.verifyIdToken(body.idToken, true);
  } catch (error) {
    if (isTransientIdentityProviderError(error)) {
      console.error(
        JSON.stringify({
          event: 'identity_provider_unavailable',
          errorCode: errorCode(error),
        }),
      );
      return NextResponse.json(
        { error: 'Identity service is temporarily unavailable.' },
        { status: 503 },
      );
    }
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Identity token is invalid or expired.' }, { status: 401 }),
    );
  }
  if (decoded.email_verified !== true)
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Verified email is required.' }, { status: 403 }),
    );
  const mfaRequired = loginContext.mfaRequired;
  if (mfaRequired && !hasSecondFactor(decoded.firebase))
    return logWebClientError(
      request,
      NextResponse.json(
        { error: 'Multi-factor authentication is required.', code: 'MFA_REQUIRED' },
        { status: 403 },
      ),
    );
  if (Date.now() / 1000 - decoded.auth_time > 5 * 60)
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Recent authentication is required.' }, { status: 401 }),
    );
  const sessionCookie = await auth.createSessionCookie(body.idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  const csrf = randomBytes(32).toString('base64url');
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(sessionCookieName(), sessionCookie, cookieOptions(true));
  response.cookies.set(CSRF_COOKIE, csrf, cookieOptions(false));
  return response;
}

function hasSecondFactor(firebase: unknown): boolean {
  return (
    typeof firebase === 'object' &&
    firebase !== null &&
    'sign_in_second_factor' in firebase &&
    firebase.sign_in_second_factor === 'totp'
  );
}

function isTransientIdentityProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return (
    errorCode(error) === 'auth/insufficient-permission' ||
    /\b(?:EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT)\b/.test(message)
  );
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'unknown';
  return typeof error.code === 'string' ? error.code : 'unknown';
}

export async function DELETE(request: NextRequest) {
  if (
    !validOrigin(request) ||
    request.headers.get('x-csrf-token') !== request.cookies.get(CSRF_COOKIE)?.value
  ) {
    return logWebClientError(
      request,
      NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 }),
    );
  }
  const cookie = request.cookies.get(sessionCookieName())?.value;
  if (cookie !== undefined && process.env.CELESNITY_AUTH_MODE !== 'local-development') {
    try {
      const auth = tenantAuthForToken(cookie);
      const decoded = await auth.verifySessionCookie(cookie, true);
      await auth.revokeRefreshTokens(decoded.sub);
    } catch {
      /* Expired sessions are still cleared. */
    }
  }
  const response = new NextResponse(null, { status: 204 });
  expireCookie(response, sessionCookieName(), true);
  expireCookie(response, CSRF_COOKIE, false);
  return response;
}

function expireCookie(response: NextResponse, name: string, httpOnly: boolean): void {
  response.cookies.set(name, '', {
    ...cookieOptions(httpOnly),
    expires: new Date(0),
    maxAge: 0,
  });
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'strict' as const,
    secure: true,
  };
}

function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const allowed = (process.env.WEB_ORIGIN ?? request.nextUrl.origin)
    .split(',')
    .map((value) => value.trim());
  return origin !== null && allowed.includes(origin);
}
