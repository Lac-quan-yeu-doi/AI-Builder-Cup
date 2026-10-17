import { describe, expect, it } from 'vitest';

import {
  approvalIssues,
  checklistFromGuide,
  deviationSuggestions,
  normalizeProcedureTimes,
  openWhyQuestions,
  parameterKey,
  repairProcedureSchema,
  reviseStep,
  safetyKey,
  skillFromGuide,
  stepRationale,
  transferMetrics,
  type RepairRun,
} from '@/src/entities/models/repair-guide';

import { BELT_PROCEDURE, guide } from './fixtures/repair-guide';

const run = (
  worker: string,
  outcome: RepairRun['outcome'],
  seconds: number[],
  deviation = '',
): RepairRun => ({
  id: `${worker}-${seconds.join('-')}`,
  worker,
  startedAt: '2026-10-17T02:00:00.000Z',
  finishedAt: `2026-10-17T0${2 + seconds.length}:00:00.000Z`,
  outcome,
  steps: seconds.map((value, index) => ({
    index,
    seconds: value,
    deviation: index === 1 ? deviation : '',
  })),
});

describe('repair guide', () => {
  it('accepts a Gemini-shaped procedure', () => {
    expect(repairProcedureSchema.safeParse(BELT_PROCEDURE).success).toBe(true);
  });

  it('blocks approval until every heard value and safety step is confirmed', () => {
    expect(approvalIssues(guide())).toEqual([
      { kind: 'safety', step: 0 },
      { kind: 'parameter', step: 1, parameter: 0 },
    ]);
    const confirmed = guide({
      confirmations: { [safetyKey(0)]: true, [parameterKey(1, 0)]: true },
    });
    expect(approvalIssues(confirmed)).toEqual([]);
  });

  it('keeps unanswered why questions open until the expert answers', () => {
    expect(openWhyQuestions(guide())).toEqual([1]);
    const answered = guide({ answers: { 1: 'Để puli về đúng vị trí trước khi siết.' } });
    expect(openWhyQuestions(answered)).toEqual([]);
    expect(stepRationale(answered, 1)).toBe('Để puli về đúng vị trí trước khi siết.');
  });

  it('measures transfer against the expert', () => {
    const measured = transferMetrics(
      guide({
        runs: [
          run('Minh', 'fixed', [60, 840]),
          run('Lan', 'not-fixed', [90, 900]),
          run('Minh', 'fixed', [50, 650]),
        ],
      }),
    );
    expect(measured).toMatchObject({ expertSeconds: 600, runs: 3, fixed: 2, medianSeconds: 800 });
    expect(measured.firstTimeFixRate).toBeCloseTo(2 / 3);
    expect(measured.ratio).toBeCloseTo(800 / 600);
  });

  it('suggests a change only from runs that still fixed the machine', () => {
    const suggestions = deviationSuggestions(
      guide({
        runs: [
          run('Minh', 'fixed', [60, 500], 'Dùng cảo thay vì gõ'),
          run('Lan', 'not-fixed', [60, 500], 'Bỏ qua bước căng'),
        ],
      }),
    );
    expect(suggestions).toEqual([
      { step: 1, deviations: [{ worker: 'Minh', text: 'Dùng cảo thay vì gõ' }] },
    ]);
  });

  it('turns the guide into a checklist and an agent skill', () => {
    const items = checklistFromGuide(guide());
    expect(items.map((item) => item.safety)).toEqual([true, false, true, false]);
    expect(items[3]?.detail).toBe('Lực siết: 45 N·m');
    const skill = skillFromGuide(guide({ answers: { 1: 'Để puli về đúng vị trí.' } }));
    expect(skill.name).toBe('repair-washer-w1-belt-slipping');
    expect(skill.name).toMatch(/^[a-z0-9][a-z0-9-]*$/u);
    expect(skill.body).toContain('**Safety:** Chỉ mở khi đã khoá tủ điện.');
    expect(skill.body).toContain('Why: Để puli về đúng vị trí.');
  });

  it('revises a step as a new draft revision with history', () => {
    const revised = reviseStep(guide({ status: 'approved' }), 1, 'Dùng cảo.', 'From runs', 'now');
    expect(revised).toMatchObject({ revision: 2, status: 'draft' });
    expect(revised.procedure.steps[1]?.instruction).toBe('Dùng cảo.');
    expect(revised.history.at(-1)).toEqual({ revision: 2, at: 'now', note: 'From runs' });
  });
});

describe('normalizeProcedureTimes', () => {
  it("fixes step times Gemini wrote as m:ss digits, against the video's length", () => {
    const procedure = {
      ...BELT_PROCEDURE,
      durationSec: 743,
      steps: BELT_PROCEDURE.steps.map((step, index) =>
        index === 1 ? { ...step, startSec: 718, endSec: 737 } : step,
      ),
    };
    const fixed = normalizeProcedureTimes(procedure, 463.7);
    expect(fixed.durationSec).toBe(463);
    expect(fixed.steps[1]).toMatchObject({ startSec: 438, endSec: 457 });
    expect(normalizeProcedureTimes(BELT_PROCEDURE, 900)).toBe(BELT_PROCEDURE);
  });

  it('fixes the steps even when Gemini got the total right', () => {
    const procedure = {
      ...BELT_PROCEDURE,
      durationSec: 464,
      steps: BELT_PROCEDURE.steps.map((step, index) =>
        index === 1 ? { ...step, startSec: 612, endSec: 717 } : step,
      ),
    };
    const fixed = normalizeProcedureTimes(procedure, 463.7);
    expect(fixed.durationSec).toBeCloseTo(463.7);
    expect(fixed.steps[1]).toMatchObject({ startSec: 372, endSec: 437 });
  });
});
