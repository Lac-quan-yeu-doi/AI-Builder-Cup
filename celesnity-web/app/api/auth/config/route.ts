import { NextRequest, NextResponse } from 'next/server';

import {
  requiredEnvironment,
  organizationLoginContext,
  organizationMfaRequired,
  tenantAuthForToken,
  unverifiedTenantId,
} from '@/di/server-auth';
import { sessionCookieName } from '@/src/entities/models/session';
import { logWebClientError } from '@/app/api/_shared/web-client-error-log';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.CELESNITY_AUTH_MODE === 'local-development') {
    // NODE_ENV can't gate this in a standalone Docker build (Next.js inlines
    // it as a build-time literal — see local-development-session.ts).
    // CELESNITY_AUTH_MODE is the sole, functional guard: a real deployment
    // simply never sets it to "local-development".
    return NextResponse.json(
      { mode: 'local-development' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const organizationSlug = request.nextUrl.searchParams.get('organization')?.trim().toLowerCase();
  if (organizationSlug === undefined || organizationSlug === null || organizationSlug === '') {
    const session = request.cookies.get(sessionCookieName())?.value;
    if (session !== undefined) {
      try {
        const tenantId = unverifiedTenantId(session);
        await tenantAuthForToken(session).verifySessionCookie(session, true);
        return identityConfiguration(tenantId, await organizationMfaRequired(tenantId));
      } catch {
        return logWebClientError(
          request,
          NextResponse.json({ error: 'Session is invalid.' }, { status: 401 }),
        );
      }
    }
    return NextResponse.json(
      { mode: 'identity-platform' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!/^[a-z][a-z0-9-]{1,62}$/u.test(organizationSlug)) {
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Invalid organization.' }, { status: 400 }),
    );
  }
  let context: Awaited<ReturnType<typeof organizationLoginContext>>;
  try {
    context = await organizationLoginContext(organizationSlug);
  } catch {
    return logWebClientError(
      request,
      NextResponse.json({ error: 'Organization was not found.' }, { status: 404 }),
    );
  }
  return identityConfiguration(context.identityTenantId, context.mfaRequired, organizationSlug);
}

function identityConfiguration(tenantId: string, mfaRequired: boolean, organizationSlug?: string) {
  return NextResponse.json(
    {
      mode: 'identity-platform',
      apiKey: requiredEnvironment('IDENTITY_PLATFORM_API_KEY'),
      authDomain: requiredEnvironment('IDENTITY_PLATFORM_AUTH_DOMAIN'),
      projectId: requiredEnvironment('IDENTITY_PLATFORM_PROJECT_ID'),
      tenantId,
      mfaRequired,
      ...(organizationSlug === undefined ? {} : { organizationSlug }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
