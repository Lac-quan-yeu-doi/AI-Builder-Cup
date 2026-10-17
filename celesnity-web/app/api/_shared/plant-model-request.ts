import { NextRequest, NextResponse } from 'next/server';

import { loadWorkspaceAccess, verifyServerSessionSubject } from '@/di/server-auth';
import { isGeminiConfigured } from '@/di/server-plant-walkthrough';
import { CSRF_COOKIE, sessionCookieName } from '@/src/entities/models/session';

/**
 * The checks every Gemini-backed plant model route makes before doing work:
 * a verified session, the CSRF token from the same origin, the plant model
 * feature, and a configured Gemini. Returns the response to send when one
 * fails, or undefined when the request may proceed.
 */
export async function rejectPlantModelRequest(
  request: NextRequest,
): Promise<NextResponse | undefined> {
  const session = request.cookies.get(sessionCookieName())?.value;
  if (session === undefined) return problem(401, 'UNAUTHENTICATED', 'Sign in again.');
  try {
    await verifyServerSessionSubject(session);
  } catch {
    return problem(401, 'UNAUTHENTICATED', 'Sign in again.');
  }
  if (!validMutationRequest(request)) {
    return problem(403, 'CSRF_REJECTED', 'CSRF validation failed.');
  }
  try {
    const features = await loadWorkspaceAccess(session, request.signal);
    if (features !== null && !features.includes('PLANT_MODEL')) {
      return problem(403, 'FEATURE_ACCESS_DENIED', 'Plant model is not available to you.');
    }
  } catch {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    return problem(503, 'ACCESS_POLICY_UNAVAILABLE', 'Access policy is unavailable.');
  }
  if (!isGeminiConfigured()) {
    return problem(503, 'GEMINI_NOT_CONFIGURED', 'Gemini is not configured on this server.');
  }
  return undefined;
}

export function problem(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Maps a Gemini failure to a response; the caller passes the domain error class to recognise. */
export function geminiFailure(
  request: NextRequest,
  error: unknown,
  readable: (error: unknown) => boolean,
  event: string,
) {
  if (request.signal.aborted) return new NextResponse(null, { status: 499 });
  if (readable(error)) {
    return problem(422, 'GEMINI_ANSWER_UNUSABLE', error instanceof Error ? error.message : '');
  }
  console.error(
    JSON.stringify({
      event,
      message: error instanceof Error ? error.message : String(error),
      occurredAt: new Date().toISOString(),
    }),
  );
  return problem(502, 'GEMINI_UNAVAILABLE', 'Gemini could not answer. Try again.');
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
