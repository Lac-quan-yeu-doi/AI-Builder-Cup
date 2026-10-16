import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  markStepComplete,
  progressPercentage,
  type ProgressRecord,
} from '@/src/entities/models/tutorial-progress';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

function incompleteStepId(record: ProgressRecord): string {
  let stepId = record.currentStepId;

  while (record.completedStepIds.includes(stepId)) {
    stepId = `${stepId}-next`;
  }

  return stepId;
}

function applyRequiredActionOutcome(
  record: ProgressRecord,
  stepId: string,
  succeeded: boolean,
): ProgressRecord {
  return succeeded ? markStepComplete(record, stepId) : record;
}

describe('markStepComplete Property 23', () => {
  // Feature: guided-user-tutorials, Property 23: Step completion is an idempotent addition
  // **Validates: Requirements 8.7, 8.9, 9.5, 9.6**
  it('adds a successful step once while repeats, revisits, and failed actions add nothing', () => {
    fc.assert(
      fc.property(
        progressRecordArbitrary,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 5 }),
        (record, remainingStepCount, revisitCount) => {
          const stepId = incompleteStepId(record);
          const totalSteps = record.completedStepIds.length + remainingStepCount;
          const percentageBefore = progressPercentage(record.completedStepIds.length, totalSteps);

          const failedAction = applyRequiredActionOutcome(record, stepId, false);

          expect(failedAction).toBe(record);
          expect(failedAction.completedStepIds).toEqual(record.completedStepIds);
          expect(progressPercentage(failedAction.completedStepIds.length, totalSteps)).toBe(
            percentageBefore,
          );

          const firstSuccess = applyRequiredActionOutcome(record, stepId, true);

          expect(firstSuccess).not.toBe(record);
          expect(firstSuccess.completedStepIds).toEqual([...record.completedStepIds, stepId]);
          expect(
            firstSuccess.completedStepIds.filter((completedId) => completedId === stepId),
          ).toHaveLength(1);
          expect(record.completedStepIds).not.toContain(stepId);

          const percentageAfterSuccess = progressPercentage(
            firstSuccess.completedStepIds.length,
            totalSteps,
          );
          let revisited = firstSuccess;

          for (let revisit = 0; revisit < revisitCount; revisit += 1) {
            revisited = applyRequiredActionOutcome(revisited, stepId, true);
          }

          expect(revisited).toBe(firstSuccess);
          expect(revisited.completedStepIds).toEqual(firstSuccess.completedStepIds);
          expect(progressPercentage(revisited.completedStepIds.length, totalSteps)).toBe(
            percentageAfterSuccess,
          );

          const failedRevisit = applyRequiredActionOutcome(revisited, stepId, false);

          expect(failedRevisit).toBe(revisited);
          expect(failedRevisit.completedStepIds).toEqual(firstSuccess.completedStepIds);
          expect(progressPercentage(failedRevisit.completedStepIds.length, totalSteps)).toBe(
            percentageAfterSuccess,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
