import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type TutorialDefinition,
  type TutorialStep,
} from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { presentWalkthroughStep } from '@/src/interface-adapters/presenters/walkthrough.presenter';
import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

function asTutorialDefinition(candidate: GeneratedTutorialDefinition): TutorialDefinition {
  const steps: readonly TutorialStep[] = candidate.steps.map(
    ({ requiredAction, targetControl, ...step }) => ({
      ...step,
      ...(requiredAction === undefined ? {} : { requiredAction }),
      ...(targetControl === undefined ? {} : { targetControl }),
    }),
  );

  return { ...candidate, steps };
}

const activeStepArbitrary = tutorialDefinitionArbitrary.chain((candidate) =>
  fc.integer({ min: 0, max: candidate.steps.length - 1 }).map((stepIndex) => ({
    candidate,
    stepIndex,
  })),
);

const fallbackLocale = { code: 'en', name: 'English' } as const;

describe('presentWalkthroughStep Property 19', () => {
  // Feature: guided-user-tutorials, Property 19: Walkthrough step ViewModel completeness
  // **Validates: Requirements 6.2, 6.3, 6.4, 6.7**
  it('exposes complete content and a valid position for every active step', () => {
    fc.assert(
      fc.property(activeStepArbitrary, ({ candidate, stepIndex }) => {
        const definition = asTutorialDefinition(candidate);
        const step = definition.steps[stepIndex];
        if (step === undefined) {
          throw new Error('Generated active step must belong to the tutorial definition.');
        }

        const progress: ProgressRecord = {
          tutorialId: definition.id,
          memberId: 'member-property-19',
          organizationId: 'organization-property-19',
          status: 'IN_PROGRESS',
          currentStepId: step.id,
          completedStepIds: [],
          contextSelections: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        };

        const viewModel = presentWalkthroughStep({
          definition,
          step,
          progress,
          locale: 'en',
          fallbackLocale,
        });

        expect(viewModel.tutorialTitle).toBe(definition.metadata.title);
        expect(viewModel.stepNumber).toBe(stepIndex + 1);
        expect(viewModel.stepNumber).toBeGreaterThanOrEqual(1);
        expect(viewModel.stepNumber).toBeLessThanOrEqual(viewModel.totalSteps);
        expect(viewModel.totalSteps).toBe(definition.steps.length);
        expect(viewModel.totalSteps).toBe(definition.metadata.stepCount);
        expect(viewModel.stepTitle).toBe(step.title);
        expect(viewModel.content).toEqual([{ kind: 'text', text: step.instructionalContent }]);

        if (step.targetControl === undefined) {
          expect(viewModel.targetAccessibleName).toBeUndefined();
        } else {
          expect(viewModel.targetAccessibleName).toBe(step.targetControl.accessibleName);
        }
      }),
      { numRuns: 100 },
    );
  });
});
