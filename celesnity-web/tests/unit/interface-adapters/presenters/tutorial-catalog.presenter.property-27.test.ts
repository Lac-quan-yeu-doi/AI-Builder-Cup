import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  presentTutorialCard,
  type TutorialCatalogPresentationItem,
} from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

const restoredStatusScenarioArbitrary = tutorialDefinitionArbitrary.chain((definition) => {
  const stepIds = definition.steps.map((step) => step.id);
  const firstStepId = stepIds[0];
  const finalStepId = stepIds.at(-1);

  if (firstStepId === undefined || finalStepId === undefined) {
    throw new RangeError('A restored tutorial requires at least one step.');
  }

  const incompleteStateArbitrary = fc.record({
    status: fc.constantFrom('IN_PROGRESS' as const, 'PAUSED' as const),
    completedStepIds: fc.subarray(stepIds, { maxLength: stepIds.length - 1 }),
  });
  const completedStateArbitrary = fc.constant({
    status: 'COMPLETED' as const,
    completedStepIds: stepIds,
  });

  return fc
    .tuple(progressRecordArbitrary, fc.oneof(incompleteStateArbitrary, completedStateArbitrary))
    .map(([progress, restoredState]) => {
      const firstIncompleteStepId = stepIds.find(
        (stepId) => !restoredState.completedStepIds.includes(stepId),
      );

      return {
        definition,
        progress: {
          ...progress,
          tutorialId: definition.id,
          status: restoredState.status,
          currentStepId: firstIncompleteStepId ?? finalStepId,
          completedStepIds: restoredState.completedStepIds,
        },
      };
    });
});

describe('presentTutorialCard Property 27', () => {
  // Feature: guided-user-tutorials, Property 27: Restored status display matches persisted status
  // **Validates: Requirements 9.11, 9.12**
  it('displays the persisted status for valid incomplete and completed restored progress', () => {
    fc.assert(
      fc.property(restoredStatusScenarioArbitrary, ({ definition, progress }) => {
        const presentationItem: TutorialCatalogPresentationItem = {
          id: definition.id,
          ...definition.metadata,
          status: progress.status,
        };

        const card = presentTutorialCard(presentationItem);
        const everyStepComplete = definition.steps.every((step) =>
          progress.completedStepIds.includes(step.id),
        );

        expect(everyStepComplete).toBe(progress.status === 'COMPLETED');
        expect(card.status).toBe(progress.status);
      }),
      { numRuns: 100 },
    );
  });
});
