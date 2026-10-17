import 'server-only';

import {
  repairAnswerSchema,
  repairComparisonSchema,
  repairProcedureSchema,
  stepVerificationSchema,
  type RepairAnswer,
  type RepairComparison,
  type RepairProcedure,
  type RepairStep,
  type StepVerification,
} from '@/src/entities/models/repair-guide';

import { generateJson, imagePart, uploadVideo, type JsonAnswer } from './gemini-client';

export interface RepairContext {
  readonly machineName: string;
  readonly faultName: string;
  readonly expert: string;
}

const CAPTURE_PROMPT = (context: RepairContext) => `You are a maintenance engineer writing a
standard operating procedure from a recording. The video shows ${context.expert || 'a technician'}
repairing "${context.machineName}" for the fault "${context.faultName}", talking as they work,
often in Vietnamese.

Turn what they do and say into a procedure a new technician can follow.
- Steps follow the order in the video. Give each the seconds where it starts and ends, so the
  clip can be replayed while someone follows the guide. Times are a plain count of seconds
  from the start: 7:43 into the video is 463, never 743. durationSec is counted the same way.
- Write titles and instructions in the language the technician speaks. Keep their terms for parts.
- Parameters: every number they say or show (torque, gap, tension, temperature, count). Quote
  their words in "heard". Do not invent values; a value you are unsure of still goes in, and a
  reviewer will confirm it.
- Mark a step safetyCritical when a mistake can injure someone or damage the machine, and
  say why in safetyNote. Isolation and lockout belong in prerequisites with safety=true.
- rationale: the reason they give for doing a step their way. When they do something
  deliberate without saying why (tapping, wiggling, a particular order, a check by ear or
  touch), leave rationale empty and write rationaleQuestion: the one question you would ask
  them to capture that know-how.
- openQuestions: what the camera did not show that a reviewer must confirm.
Report only what the recording shows.`;

/** Watches a repair recorded with voice-over and returns it as a procedure. */
export async function captureRepair(
  video: Blob,
  context: RepairContext,
  signal?: AbortSignal,
): Promise<JsonAnswer<RepairProcedure>> {
  const file = await uploadVideo(video, signal);
  return generateJson(repairProcedureSchema, [file, { text: CAPTURE_PROMPT(context) }], {
    signal,
  });
}

/** Finds where two technicians fixed the same fault differently, and which way to teach. */
export async function compareRepairs(
  first: { readonly expert: string; readonly procedure: RepairProcedure },
  second: { readonly expert: string; readonly procedure: RepairProcedure },
  signal?: AbortSignal,
): Promise<JsonAnswer<RepairComparison>> {
  return generateJson(
    repairComparisonSchema,
    [
      {
        text: `Two technicians fixed the same fault on the same kind of machine. Compare their
procedures step by step. Ignore wording; find where what they actually did differs: order,
tools, values, checks, shortcuts, safety. For each difference say why it could matter and how
risky it is. expertA is ${first.expert || 'the first technician'}, expertB is ${second.expert || 'the second technician'}.
Answer in the language the procedures are written in.

expertA:
${JSON.stringify(first.procedure)}

expertB:
${JSON.stringify(second.procedure)}`,
      },
    ],
    { signal },
  );
}

/** Checks a photo the technician took against what a step should leave behind. */
export async function verifyRepairStep(
  photo: Blob,
  step: RepairStep,
  signal?: AbortSignal,
): Promise<JsonAnswer<StepVerification>> {
  return generateJson(
    stepVerificationSchema,
    [
      await imagePart(photo),
      {
        text: `A technician says they finished this repair step and took the photo above as proof.
Step: ${step.title}. ${step.instruction}
${step.safetyCritical ? `Safety: ${step.safetyNote}` : ''}
Decide whether the photo clearly shows the step is done. Be strict for safety steps: a lockout
step needs a visible lock or tag on the isolator. When unsure, verified=false. Answer
"observed" in the language of the step.`,
      },
    ],
    { signal, temperature: 0 },
  );
}

/** Answers a technician's question mid-repair, from the guide only. */
export async function answerRepairQuestion(
  procedure: RepairProcedure,
  step: number,
  question: string,
  signal?: AbortSignal,
): Promise<JsonAnswer<RepairAnswer>> {
  return generateJson(
    repairAnswerSchema,
    [
      {
        text: `You are coaching a technician through a repair. They are on step ${step + 1}.
Answer their question in their language, short enough to read aloud. Use only the guide below
and cite the step numbers you used. If the guide does not cover it, say so, set outsideGuide,
and suggest asking a senior technician. Never tell them to skip a safety step.

Guide:
${JSON.stringify(procedure)}

Question: ${question}`,
      },
    ],
    { signal, temperature: 0.3 },
  );
}
