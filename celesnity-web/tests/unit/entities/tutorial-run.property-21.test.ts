import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { canAdvanceNext, isFirstStep } from '@/src/entities/models/tutorial-run';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

type NavigationDirection = 'PREVIOUS' | 'NEXT';

interface NavigationCase {
  readonly steps: readonly TutorialStep[];
  readonly currentIndex: number;
  readonly record: ProgressRecord;
}

function stepAt(steps: readonly TutorialStep[], index: number): TutorialStep {
  const step = steps[index];

  if (step === undefined) {
    throw new Error(`Expected tutorial step at index ${index}`);
  }

  return step;
}

const navigationCaseArbitrary: fc.Arbitrary<NavigationCase> = fc
  .tuple(
    tutorialDefinitionArbitrary.filter((definition) => definition.steps.length >= 2),
    progressRecordArbitrary,
  )
  .chain(([definition, generatedRecord]) =>
    fc.integer({ min: 0, max: definition.steps.length - 1 }).map((currentIndex) => {
      const currentStep = stepAt(definition.steps, currentIndex);

      return {
        steps: definition.steps,
        currentIndex,
        record: {
          ...generatedRecord,
          tutorialId: definition.id,
          currentStepId: currentStep.id,
        },
      };
    }),
  );

function attemptNavigation(
  record: ProgressRecord,
  steps: readonly TutorialStep[],
  direction: NavigationDirection,
): ProgressRecord {
  const currentIndex = steps.findIndex((step) => step.id === record.currentStepId);
  const currentStep = steps[currentIndex];

  if (currentStep === undefined) {
    return record;
  }

  if (direction === 'PREVIOUS') {
    const previousStep = steps[currentIndex - 1];

    return previousStep === undefined
      ? record
      : {
          ...record,
          currentStepId: previousStep.id,
        };
  }

  if (!canAdvanceNext(currentStep, record)) {
    return record;
  }

  const nextStep = steps[currentIndex + 1];

  return nextStep === undefined
    ? record
    : {
        ...record,
        currentStepId: nextStep.id,
      };
}

function expectCompletionsNotShrunk(before: readonly string[], after: readonly string[]): void {
  expect(after).toHaveLength(before.length);
  expect(after).toEqual(before);
}

describe('tutorial run Property 21', () => {
  // Feature: guided-user-tutorials, Property 21: Previous availability and non-advancing navigation
  // **Validates: Requirements 8.2, 8.3, 8.6, 8.11**
  it('enables Previous exactly after the first step and preserves completions during blocked or backward navigation', () => {
    fc.assert(
      fc.property(navigationCaseArbitrary, ({ steps, currentIndex, record }) => {
        const currentStep = stepAt(steps, currentIndex);
        const previousAvailable = !isFirstStep(currentStep, steps);

        expect(previousAvailable).toBe(currentIndex > 0);

        const afterPrevious = attemptNavigation(record, steps, 'PREVIOUS');
        const expectedPreviousStep =
          currentIndex === 0 ? currentStep : stepAt(steps, currentIndex - 1);

        expectCompletionsNotShrunk(record.completedStepIds, afterPrevious.completedStepIds);
        expect(afterPrevious.currentStepId).toBe(expectedPreviousStep.id);
        if (!previousAvailable) {
          expect(afterPrevious).toBe(record);
        }

        const blockedStep: TutorialStep = {
          ...currentStep,
          requiredAction: currentStep.requiredAction ?? {
            id: `required-action-${currentStep.id}`,
            accessibleName: `Complete ${currentStep.title}`,
          },
        };
        const blockedSteps = steps.map((step, index) =>
          index === currentIndex ? blockedStep : step,
        );
        const blockedRecord: ProgressRecord = {
          ...record,
          completedStepIds: record.completedStepIds.filter(
            (completedStepId) => completedStepId !== blockedStep.id,
          ),
        };

        expect(canAdvanceNext(blockedStep, blockedRecord)).toBe(false);

        const afterUnavailableNext = attemptNavigation(blockedRecord, blockedSteps, 'NEXT');

        expect(afterUnavailableNext).toBe(blockedRecord);
        expect(afterUnavailableNext.currentStepId).toBe(blockedStep.id);
        expectCompletionsNotShrunk(
          blockedRecord.completedStepIds,
          afterUnavailableNext.completedStepIds,
        );
      }),
      { numRuns: 100 },
    );
  });
});
