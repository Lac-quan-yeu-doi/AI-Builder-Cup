import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { compareRepairs, GeminiAnswerError } from '@/di/server-plant-walkthrough';
import {
  geminiFailure,
  problem,
  rejectPlantModelRequest,
} from '@/app/api/_shared/plant-model-request';
import { repairProcedureSchema } from '@/src/entities/models/repair-guide';

export const runtime = 'nodejs';
export const maxDuration = 120;

const side = z.object({ expert: z.string().max(160), procedure: repairProcedureSchema });
const body = z.object({ first: side, second: side });

/** Compares two technicians' procedures for the same fault. */
export async function POST(request: NextRequest) {
  const rejected = await rejectPlantModelRequest(request);
  if (rejected !== undefined) return rejected;
  const parsed = body.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return problem(400, 'INVALID_INPUT', 'Send two procedures to compare.');
  try {
    const answer = await compareRepairs(parsed.data.first, parsed.data.second, request.signal);
    return NextResponse.json(answer.value);
  } catch (error: unknown) {
    return geminiFailure(
      request,
      error,
      (value) => value instanceof GeminiAnswerError,
      'repair_compare_failed',
    );
  }
}
