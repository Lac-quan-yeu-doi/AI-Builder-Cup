import { NextRequest, NextResponse } from 'next/server';

import { loadWorkspaceAccess, verifyServerSessionSubject } from '@/di/server-auth';
import {
  extractPlantWalkthrough,
  isGeminiConfigured,
  WalkthroughExtractionError,
} from '@/di/server-plant-walkthrough';
import { CSRF_COOKIE, sessionCookieName } from '@/src/entities/models/session';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

/**
 * Maps a walkthrough video to a plant model with Gemini. The key stays on the
 * server; the caller needs a session, the CSRF token and the plant model
 * feature, like any other plant model write.
 */
export async function POST(request: NextRequest) {
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

  let video: FormDataEntryValue | null;
  try {
    video = (await request.formData()).get('video');
  } catch {
    return problem(400, 'INVALID_INPUT', 'Send the video as multipart form data.');
  }
  if (!(video instanceof Blob) || !video.type.startsWith('video/')) {
    return problem(400, 'INVALID_INPUT', 'Attach the walkthrough as the "video" field.');
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return problem(400, 'INVALID_INPUT', 'The video is larger than 2 GB.');
  }

  try {
    return NextResponse.json(await extractPlantWalkthrough(video, request.signal));
  } catch (error: unknown) {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    if (error instanceof WalkthroughExtractionError) {
      return problem(422, 'WALKTHROUGH_UNREADABLE', error.message);
    }
    console.error(
      JSON.stringify({
        event: 'plant_walkthrough_failed',
        message: error instanceof Error ? error.message : String(error),
        occurredAt: new Date().toISOString(),
      }),
    );
    return problem(502, 'GEMINI_UNAVAILABLE', 'Gemini could not map this video. Try again.');
  }
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

function problem(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}
