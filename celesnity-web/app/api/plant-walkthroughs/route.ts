import { NextRequest, NextResponse } from 'next/server';

import { extractPlantWalkthrough, GeminiAnswerError } from '@/di/server-plant-walkthrough';
import {
  geminiFailure,
  problem,
  rejectPlantModelRequest,
} from '@/app/api/_shared/plant-model-request';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

/** Maps a walkthrough video to a plant model with Gemini; the key stays on the server. */
export async function POST(request: NextRequest) {
  const rejected = await rejectPlantModelRequest(request);
  if (rejected !== undefined) return rejected;

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
    return geminiFailure(
      request,
      error,
      (value) => value instanceof GeminiAnswerError,
      'plant_walkthrough_failed',
    );
  }
}
