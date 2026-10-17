import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { answerRepairQuestion, GeminiAnswerError } from '@/di/server-plant-walkthrough';
import {
  geminiFailure,
  problem,
  rejectPlantModelRequest,
} from '@/app/api/_shared/plant-model-request';
import { repairProcedureSchema } from '@/src/entities/models/repair-guide';

export const runtime = 'nodejs';
export const maxDuration = 60;

const body = z.object({
  procedure: repairProcedureSchema,
  step: z.number().int().min(0),
  question: z.string().trim().min(1).max(500),
});

/** Answers a technician's question mid-repair, from the guide only. */
export async function POST(request: NextRequest) {
  const rejected = await rejectPlantModelRequest(request);
  if (rejected !== undefined) return rejected;
  const parsed = body.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return problem(400, 'INVALID_INPUT', 'Send the guide, step and question.');
  try {
    const answer = await answerRepairQuestion(
      parsed.data.procedure,
      parsed.data.step,
      parsed.data.question,
      request.signal,
    );
    return NextResponse.json(answer.value);
  } catch (error: unknown) {
    return geminiFailure(
      request,
      error,
      (value) => value instanceof GeminiAnswerError,
      'repair_ask_failed',
    );
  }
}
