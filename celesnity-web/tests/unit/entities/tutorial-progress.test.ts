import { describe, expect, it } from 'vitest';

import {
  markStepComplete,
  progressPercentage,
  resumePoint,
  type ProgressRecord,
} from '@/src/entities/models/tutorial-progress';

const progressRecord: ProgressRecord = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-1',
  completedStepIds: [],
  contextSelections: [],
  updatedAt: '2026-09-04T00:00:00.000Z',
};

describe('progressPercentage', () => {
  it('calculates a whole-number percentage and rounds halves upward', () => {
    expect(progressPercentage(1, 8)).toBe(13);
    expect(progressPercentage(2, 3)).toBe(67);
  });

  it('clamps percentages to the inclusive range from zero through 100', () => {
    expect(progressPercentage(-1, 4)).toBe(0);
    expect(progressPercentage(5, 4)).toBe(100);
  });

  it('returns zero when a percentage cannot be calculated from a positive finite total', () => {
    expect(progressPercentage(1, 0)).toBe(0);
    expect(progressPercentage(Number.NaN, 4)).toBe(0);
  });
});

describe('markStepComplete', () => {
  it('immutably adds a step exactly once', () => {
    const completed = markStepComplete(progressRecord, 'step-1');

    expect(completed).not.toBe(progressRecord);
    expect(completed.completedStepIds).toEqual(['step-1']);
    expect(progressRecord.completedStepIds).toEqual([]);
    expect(markStepComplete(completed, 'step-1')).toBe(completed);
  });
});

describe('resumePoint', () => {
  const steps = [
    { id: 'step-3', order: 3, title: 'Third' },
    { id: 'step-1', order: 1, title: 'First' },
    { id: 'step-2', order: 2, title: 'Second' },
  ] as const;

  it('returns the first incomplete step in tutorial order without reordering the input', () => {
    const originalOrder = steps.map((step) => step.id);
    const record = { ...progressRecord, completedStepIds: ['step-1'] };

    expect(resumePoint(record, steps)).toBe(steps[2]);
    expect(steps.map((step) => step.id)).toEqual(originalOrder);
  });

  it('rejects a resume request when every step is complete', () => {
    const record = {
      ...progressRecord,
      status: 'COMPLETED' as const,
      completedStepIds: steps.map((step) => step.id),
    };

    expect(() => resumePoint(record, steps)).toThrow(RangeError);
  });
});
