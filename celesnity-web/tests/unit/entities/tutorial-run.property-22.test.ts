import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { canAdvanceNext } from '@/src/entities/models/tutorial-run';
import { tutorialStepArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

describe('canAdvanceNext Property 22', () => {
  // Feature: guided-user-tutorials, Property 22: Forward availability reflects required action, target, and destination readiness
  // **Validates: Requirements 7.7, 8.4, 8.5, 8.8, 8.13, 8.14**
  it('is available iff every applicable forward gate is ready', () => {
    fc.assert(
      fc.property(
        tutorialStepArbitrary,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (step, targetLocated, requiredActionSucceeded, destinationTransitionComplete) => {
          const record: ProgressRecord = {
            tutorialId: 'tutorial-1',
            memberId: 'member-1',
            organizationId: 'organization-1',
            status: 'IN_PROGRESS',
            currentStepId: step.id,
            completedStepIds: requiredActionSucceeded ? [step.id] : [],
            contextSelections: [],
            updatedAt: '2026-09-21T00:00:00.000Z',
          };
          const expected =
            (step.targetControl === undefined || targetLocated) &&
            (step.requiredAction === undefined || requiredActionSucceeded) &&
            destinationTransitionComplete;

          expect(
            canAdvanceNext(step, record, {
              targetLocated,
              destinationTransitionComplete,
            }),
          ).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
