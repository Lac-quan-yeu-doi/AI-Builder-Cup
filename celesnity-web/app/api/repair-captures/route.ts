import { NextRequest, NextResponse } from 'next/server';

import { captureRepair, GeminiAnswerError } from '@/di/server-plant-walkthrough';
import {
  geminiFailure,
  problem,
  rejectPlantModelRequest,
} from '@/app/api/_shared/plant-model-request';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

/** Turns a repair recorded with voice-over into a procedure. */
export async function POST(request: NextRequest) {
  const rejected = await rejectPlantModelRequest(request);
  if (rejected !== undefined) return rejected;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'INVALID_INPUT', 'Send the video as multipart form data.');
  }
  const video = form.get('video');
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim().slice(0, 160) : '';
  };
  if (!(video instanceof Blob) || !video.type.startsWith('video/')) {
    return problem(400, 'INVALID_INPUT', 'Attach the repair as the "video" field.');
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return problem(400, 'INVALID_INPUT', 'The video is larger than 2 GB.');
  }
  const context = {
    machineName: field('machineName'),
    faultName: field('faultName'),
    expert: field('expert'),
  };
  if (context.machineName === '' || context.faultName === '') {
    return problem(400, 'INVALID_INPUT', 'Name the machine and the fault.');
  }
  try {
    const answer = await captureRepair(video, context, request.signal);
    return NextResponse.json({
      procedure: answer.value,
      model: answer.model,
      elapsedMs: answer.elapsedMs,
      inputTokens: answer.inputTokens,
    });
  } catch (error: unknown) {
    return geminiFailure(
      request,
      error,
      (value) => value instanceof GeminiAnswerError,
      'repair_capture_failed',
    );
  }
}
