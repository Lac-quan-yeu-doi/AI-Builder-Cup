import { describe, expect, it } from 'vitest';

import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  applyCompletion,
  canAdvanceNext,
  isFinalStep,
  isFirstStep,
} from '@/src/entities/models/tutorial-run';

const READY_FOR_FORWARD = {
  targetLocated: true,
  destinationTransitionComplete: true,
} as const;

function step(id: string, order: number, requiredAction = false): TutorialStep {
  return {
    id,
    order,
    title: `Step ${order}`,
    instructionalContent: `Complete step ${order}`,
    destinationFeature: 'HOME',
    destinationHref: '/workspace',
    requiredAction: requiredAction
      ? { id: `action-${order}`, accessibleName: `Complete action ${order}` }
      : undefined,
    targetControl: undefined,
  };
}

function progress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    tutorialId: 'tutorial-1',
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId: 'step-1',
    completedStepIds: [],
    contextSelections: [],
    updatedAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('tutorial run entity', () => {
  it('allows advancing a step that has no required action', () => {
    expect(canAdvanceNext(step('step-1', 1), progress(), READY_FOR_FORWARD)).toBe(true);
  });

  it('blocks advancing until a step required action has completed', () => {
    const actionStep = step('step-1', 1, true);

    expect(canAdvanceNext(actionStep, progress(), READY_FOR_FORWARD)).toBe(false);
    expect(
      canAdvanceNext(actionStep, progress({ completedStepIds: ['step-1'] }), READY_FOR_FORWARD),
    ).toBe(true);
  });

  it('identifies the first and final steps by stable step identifier', () => {
    const firstStep = step('step-1', 1);
    const middleStep = step('step-2', 2);
    const finalStep = step('step-3', 3);
    const steps = [firstStep, middleStep, finalStep];

    expect(isFirstStep({ ...firstStep }, steps)).toBe(true);
    expect(isFirstStep(middleStep, steps)).toBe(false);
    expect(isFinalStep({ ...finalStep }, steps)).toBe(true);
    expect(isFinalStep(middleStep, steps)).toBe(false);
  });

  it('treats a single-step tutorial as both first and final', () => {
    const onlyStep = step('step-1', 1);

    expect(isFirstStep(onlyStep, [onlyStep])).toBe(true);
    expect(isFinalStep(onlyStep, [onlyStep])).toBe(true);
  });

  it('does not identify a step outside the tutorial as first or final', () => {
    const steps = [step('step-1', 1), step('step-2', 2)];
    const unknownStep = step('unknown', 1);

    expect(isFirstStep(unknownStep, steps)).toBe(false);
    expect(isFinalStep(unknownStep, steps)).toBe(false);
  });

  it('applies completion without changing the current or completed steps', () => {
    const record = progress({
      currentStepId: 'step-3',
      completedStepIds: ['step-1', 'step-2', 'step-3'],
    });

    expect(applyCompletion(record)).toEqual({ ...record, status: 'COMPLETED' });
  });

  it('is idempotent when completion is applied repeatedly', () => {
    const completed = applyCompletion(progress());

    expect(applyCompletion(completed)).toBe(completed);
  });
});
