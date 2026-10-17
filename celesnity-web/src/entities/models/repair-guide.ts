import { z } from 'zod';

import { clockDigitsFix } from '@/src/entities/models/video-timestamp';

/*
 * Repair know-how captured from a technician fixing a machine on camera while
 * talking through it. Gemini returns a `RepairProcedure`; the guide wraps it
 * with what people add afterwards: confirmed values, the expert's answers to
 * "why", approval, revisions and every guided repair that used it. Those runs
 * are what show whether the knowledge actually transferred.
 */

const text = (description: string) => z.string().describe(description);

export const repairParameterSchema = z.object({
  name: text('What is being set or measured, e.g. "bolt torque", "belt tension".'),
  value: text('The value as said or shown, e.g. "45".'),
  unit: text('Unit, e.g. "N·m", "mm", or "" when none.'),
  heard: text('The words the technician used, quoted, in their language.'),
});

export const repairStepSchema = z.object({
  title: text('Short imperative title, e.g. "Release belt tension".'),
  instruction: text('What to do, in two or three plain sentences a new technician can follow.'),
  startSec: z.number().min(0).describe('Second in the video where this step starts.'),
  endSec: z.number().min(0).describe('Second in the video where this step ends.'),
  tools: z.array(z.string()).describe('Tools used in this step.'),
  parameters: z.array(repairParameterSchema),
  safetyCritical: z
    .boolean()
    .describe('true when a mistake here can injure someone or damage the machine.'),
  safetyNote: text('The hazard and how to avoid it, or "" when none.'),
  rationale: text('Why the technician does it this way, from what they said, or "".'),
  rationaleQuestion: text(
    'When the reason is not said: the question to ask the technician, e.g. "Why tap the housing before pulling the bearing?". "" when the reason was explained.',
  ),
});

export const repairProcedureSchema = z.object({
  title: text('Name of the repair, e.g. "Replace the drive belt on Washer W1".'),
  faultSymptom: text('What was wrong, as seen or said, e.g. "belt slipping, squeal at start".'),
  summary: text('Two sentences: what was done and why it fixed the fault.'),
  prerequisites: z.array(
    z.object({
      text: text('Something to do or have before starting.'),
      safety: z.boolean().describe('true for lockout, isolation, PPE and similar.'),
    }),
  ),
  tools: z.array(z.string()),
  parts: z.array(z.string()).describe('Spare parts or consumables used.'),
  steps: z.array(repairStepSchema).min(1),
  outcome: text('How the technician checked the fix worked.'),
  durationSec: z.number().min(0).describe('How long the repair took in the video.'),
  openQuestions: z
    .array(z.string())
    .describe('What the video does not show that a reviewer should confirm.'),
});

export type RepairParameter = z.infer<typeof repairParameterSchema>;
export type RepairStep = z.infer<typeof repairStepSchema>;
export type RepairProcedure = z.infer<typeof repairProcedureSchema>;

export const repairComparisonSchema = z.object({
  summary: text('Two sentences on how the two technicians differ.'),
  sharedSteps: z.number().int().min(0).describe('How many steps both did the same way.'),
  differences: z.array(
    z.object({
      step: text('The step where they differ.'),
      expertA: text('What the first technician did.'),
      expertB: text('What the second technician did.'),
      whyItMatters: text('Why the difference could matter for the result or for safety.'),
      risk: z.enum(['low', 'medium', 'high']),
    }),
  ),
  recommendation: text('Which way the guide should teach, and why.'),
});
export type RepairComparison = z.infer<typeof repairComparisonSchema>;

export const stepVerificationSchema = z.object({
  verified: z.boolean().describe('true only when the photo clearly shows the step is done.'),
  observed: text('What the photo shows, in one sentence.'),
  confidence: z.number().min(0).max(1),
});
export type StepVerification = z.infer<typeof stepVerificationSchema>;

export const repairAnswerSchema = z.object({
  answer: text('A short spoken-style answer, three sentences at most.'),
  stepNumbers: z.array(z.number().int().min(1)).describe('Guide step numbers the answer uses.'),
  outsideGuide: z.boolean().describe('true when the guide does not cover the question.'),
});
export type RepairAnswer = z.infer<typeof repairAnswerSchema>;

export type RepairGuideStatus = 'draft' | 'approved';

export interface RepairRunStep {
  readonly index: number;
  readonly seconds: number;
  /** What the technician did differently, in their words; empty when they followed the step. */
  readonly deviation: string;
  readonly verified?: boolean;
}

export interface RepairRun {
  readonly id: string;
  readonly worker: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly outcome: 'fixed' | 'not-fixed';
  readonly steps: readonly RepairRunStep[];
}

export interface RepairGuideRevision {
  readonly revision: number;
  readonly at: string;
  readonly note: string;
}

export interface RepairGuide {
  readonly id: string;
  readonly siteId: string;
  readonly machineId?: string;
  readonly machineName: string;
  readonly faultName: string;
  readonly expert: string;
  readonly status: RepairGuideStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly model: string;
  readonly videoName: string;
  readonly procedure: RepairProcedure;
  /** Keys from `parameterKey` and `safetyKey`; true once a person confirmed it. */
  readonly confirmations: Readonly<Record<string, boolean>>;
  /** The expert's answers to each step's `rationaleQuestion`, by step index. */
  readonly answers: Readonly<Record<number, string>>;
  readonly history: readonly RepairGuideRevision[];
  readonly skillName?: string;
  readonly runs: readonly RepairRun[];
  readonly comparison?: { readonly expert: string; readonly result: RepairComparison };
}

/**
 * Puts times back in seconds when Gemini wrote them as clock digits (see
 * clockDigitsFix). Step times are judged together; the total is judged on its
 * own, since Gemini often gets one right and not the other. Nothing is left
 * past the end of the video.
 */
export function normalizeProcedureTimes(
  procedure: RepairProcedure,
  videoSeconds: number | undefined,
): RepairProcedure {
  if (videoSeconds === undefined || !Number.isFinite(videoSeconds) || videoSeconds <= 0) {
    return procedure;
  }
  const stepFix = clockDigitsFix(
    procedure.steps.flatMap((step) => [step.startSec, step.endSec]),
    videoSeconds,
  );
  const totalFix = clockDigitsFix([procedure.durationSec], videoSeconds);
  if (stepFix === undefined && totalFix === undefined) {
    const inside = [
      procedure.durationSec,
      ...procedure.steps.flatMap((step) => [step.startSec, step.endSec]),
    ].every((value) => value <= videoSeconds + 2);
    if (inside) return procedure;
  }
  const clamp = (value: number) => Math.min(Math.max(0, value), videoSeconds);
  const step = stepFix ?? ((value: number) => value);
  return {
    ...procedure,
    durationSec: clamp((totalFix ?? ((value: number) => value))(procedure.durationSec)),
    steps: procedure.steps.map((item) => ({
      ...item,
      startSec: clamp(step(item.startSec)),
      endSec: clamp(step(item.endSec)),
    })),
  };
}

export const parameterKey = (step: number, parameter: number) => `param:${step}:${parameter}`;
export const safetyKey = (step: number) => `safety:${step}`;

export interface ApprovalIssue {
  readonly kind: 'parameter' | 'safety';
  readonly step: number;
  readonly parameter?: number;
}

/**
 * What must be confirmed by a person before the guide can teach anyone: every
 * value heard in the video, and every safety-critical step. Unanswered "why"
 * questions are worth answering but do not block approval.
 */
export function approvalIssues(guide: RepairGuide): ApprovalIssue[] {
  const issues: ApprovalIssue[] = [];
  guide.procedure.steps.forEach((step, index) => {
    if (step.safetyCritical && guide.confirmations[safetyKey(index)] !== true) {
      issues.push({ kind: 'safety', step: index });
    }
    step.parameters.forEach((_parameter, parameter) => {
      if (guide.confirmations[parameterKey(index, parameter)] !== true) {
        issues.push({ kind: 'parameter', step: index, parameter });
      }
    });
  });
  return issues;
}

export function openWhyQuestions(guide: RepairGuide): number[] {
  return guide.procedure.steps.flatMap((step, index) =>
    step.rationale === '' &&
    step.rationaleQuestion !== '' &&
    (guide.answers[index] ?? '').trim() === ''
      ? [index]
      : [],
  );
}

/** The reason for a step: what was said on camera, or the expert's later answer. */
export function stepRationale(guide: RepairGuide, index: number): string {
  const step = guide.procedure.steps[index];
  if (step === undefined) return '';
  return step.rationale !== '' ? step.rationale : (guide.answers[index] ?? '').trim();
}

export function formatParameter(parameter: RepairParameter): string {
  return [parameter.name, `${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''}`]
    .filter(Boolean)
    .join(': ');
}

export interface TransferMetrics {
  readonly expertSeconds: number;
  readonly runs: number;
  readonly fixed: number;
  readonly firstTimeFixRate?: number;
  readonly medianSeconds?: number;
  readonly latestSeconds?: number;
  /** Median novice time over the expert's time; 1 means as fast as the expert. */
  readonly ratio?: number;
}

/** How well the know-how transferred: novice repair time and first-time fixes against the expert. */
export function transferMetrics(guide: RepairGuide): TransferMetrics {
  const expertSeconds = guide.procedure.durationSec;
  const runs = [...guide.runs].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const fixed = runs.filter((run) => run.outcome === 'fixed');
  const seconds = fixed.map(runSeconds).sort((a, b) => a - b);
  const medianSeconds =
    seconds.length === 0
      ? undefined
      : seconds.length % 2 === 1
        ? seconds[(seconds.length - 1) / 2]
        : ((seconds[seconds.length / 2 - 1] ?? 0) + (seconds[seconds.length / 2] ?? 0)) / 2;
  const latest = fixed.at(-1);
  return {
    expertSeconds,
    runs: runs.length,
    fixed: fixed.length,
    firstTimeFixRate: runs.length === 0 ? undefined : fixed.length / runs.length,
    medianSeconds,
    latestSeconds: latest === undefined ? undefined : runSeconds(latest),
    ratio:
      medianSeconds === undefined || expertSeconds <= 0 ? undefined : medianSeconds / expertSeconds,
  };
}

export function runSeconds(run: RepairRun): number {
  return run.steps.reduce((total, step) => total + step.seconds, 0);
}

export interface DeviationSuggestion {
  readonly step: number;
  readonly deviations: readonly { readonly worker: string; readonly text: string }[];
}

/**
 * Where technicians did something different and still fixed the machine. One
 * such run is a hint; it is up to a reviewer whether the guide should change.
 */
export function deviationSuggestions(guide: RepairGuide): DeviationSuggestion[] {
  const byStep = new Map<number, { worker: string; text: string }[]>();
  for (const run of guide.runs) {
    if (run.outcome !== 'fixed') continue;
    for (const step of run.steps) {
      const deviation = step.deviation.trim();
      if (deviation === '') continue;
      byStep.set(step.index, [
        ...(byStep.get(step.index) ?? []),
        { worker: run.worker, text: deviation },
      ]);
    }
  }
  return [...byStep.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, deviations]) => ({ step, deviations }));
}

export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly safety: boolean;
  readonly step?: number;
}

/** The guide as a checklist a technician ticks through: prerequisites first, then each step. */
export function checklistFromGuide(guide: RepairGuide): ChecklistItem[] {
  return [
    ...guide.procedure.prerequisites.map((item, index) => ({
      id: `pre-${index}`,
      label: item.text,
      detail: '',
      safety: item.safety,
    })),
    ...guide.procedure.steps.map((step, index) => ({
      id: `step-${index}`,
      label: step.title,
      detail: step.parameters.map(formatParameter).join(' · '),
      safety: step.safetyCritical,
      step: index,
    })),
  ];
}

export interface RepairSkillDraft {
  readonly name: string;
  readonly description: string;
  readonly namespace: string;
  readonly body: string;
}

/**
 * The guide as an agent skill, so the assistant can answer "how do I fix
 * this?" from what the expert actually did. The description is what the agent
 * routes on, so it names the machine and the symptom.
 */
export function skillFromGuide(guide: RepairGuide): RepairSkillDraft {
  const { procedure } = guide;
  const lines = [
    `# ${procedure.title}`,
    '',
    `Machine: ${guide.machineName}. Fault: ${guide.faultName}. Symptom: ${procedure.faultSymptom}.`,
    `Recorded from ${guide.expert}, revision ${guide.revision}.`,
    '',
    procedure.summary,
    '',
    '## Before you start',
    ...procedure.prerequisites.map((item) => `- ${item.safety ? '**Safety:** ' : ''}${item.text}`),
    ...(procedure.tools.length > 0 ? [`- Tools: ${procedure.tools.join(', ')}`] : []),
    ...(procedure.parts.length > 0 ? [`- Parts: ${procedure.parts.join(', ')}`] : []),
    '',
    '## Steps',
    ...procedure.steps.flatMap((step, index) => {
      const why = stepRationale(guide, index);
      return [
        `${index + 1}. **${step.title}.** ${step.instruction}`,
        ...step.parameters.map((parameter) => `   - ${formatParameter(parameter)}`),
        ...(step.safetyCritical && step.safetyNote ? [`   - **Safety:** ${step.safetyNote}`] : []),
        ...(why ? [`   - Why: ${why}`] : []),
      ];
    }),
    '',
    '## Check the fix',
    procedure.outcome,
    '',
    'When you answer, cite step numbers. Never skip a safety step, and say so when the question is outside this guide.',
  ];
  return {
    name: slug(`repair-${guide.machineName}-${guide.faultName}`),
    description: `How to fix "${guide.faultName}" on ${guide.machineName} (${procedure.faultSymptom}), step by step from a recorded expert repair.`,
    namespace: 'maintenance',
    body: lines.join('\n'),
  };
}

/** Rewrites one step's instruction as a new draft revision, keeping the history. */
export function reviseStep(
  guide: RepairGuide,
  index: number,
  instruction: string,
  note: string,
  at: string,
): RepairGuide {
  const revision = guide.revision + 1;
  return {
    ...guide,
    revision,
    status: 'draft',
    updatedAt: at,
    procedure: {
      ...guide.procedure,
      steps: guide.procedure.steps.map((step, position) =>
        position === index ? { ...step, instruction } : step,
      ),
    },
    history: [...guide.history, { revision, at, note }],
  };
}

function slug(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/gu, '')
      .replace(/đ/giu, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 64)
      .replace(/-+$/u, '') || 'repair-guide'
  );
}
