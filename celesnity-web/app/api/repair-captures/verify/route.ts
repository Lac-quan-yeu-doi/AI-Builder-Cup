import { NextRequest, NextResponse } from 'next/server';

import { GeminiAnswerError, verifyRepairStep } from '@/di/server-plant-walkthrough';
import {
  geminiFailure,
  problem,
  rejectPlantModelRequest,
} from '@/app/api/_shared/plant-model-request';
import { repairStepSchema } from '@/src/entities/models/repair-guide';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 10 * 1024 ** 2;

/** Checks a photo against what a repair step should leave behind. */
export async function POST(request: NextRequest) {
  const rejected = await rejectPlantModelRequest(request);
  if (rejected !== undefined) return rejected;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, 'INVALID_INPUT', 'Send the photo as multipart form data.');
  }
  const photo = form.get('photo');
  if (
    !(photo instanceof Blob) ||
    !photo.type.startsWith('image/') ||
    photo.size > MAX_PHOTO_BYTES
  ) {
    return problem(400, 'INVALID_INPUT', 'Attach a photo under 10 MB as the "photo" field.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('step') ?? ''));
  } catch {
    raw = undefined;
  }
  const step = repairStepSchema.safeParse(raw);
  if (!step.success) return problem(400, 'INVALID_INPUT', 'Send the step being checked.');
  try {
    const answer = await verifyRepairStep(photo, step.data, request.signal);
    return NextResponse.json(answer.value);
  } catch (error: unknown) {
    return geminiFailure(
      request,
      error,
      (value) => value instanceof GeminiAnswerError,
      'repair_verify_failed',
    );
  }
}
