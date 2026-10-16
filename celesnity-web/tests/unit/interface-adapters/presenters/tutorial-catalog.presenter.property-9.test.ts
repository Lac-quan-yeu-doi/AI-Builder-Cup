import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { progressPercentage } from '@/src/entities/models/tutorial-progress';
import {
  presentTutorialCard,
  type TutorialCatalogPresentationItem,
} from '@/src/interface-adapters/presenters/tutorial-catalog.presenter';
import {
  progressRecordArbitrary,
  tutorialDefinitionArbitrary,
} from '@/tests/unit/entities/tutorial-arbitraries';

const catalogCardScenarioArbitrary = tutorialDefinitionArbitrary.chain((definition) => {
  const stepIds = definition.steps.map((step) => step.id);
  const firstStepId = stepIds[0];

  if (firstStepId === undefined) {
    throw new RangeError('A catalog tutorial requires at least one step.');
  }

  const matchingProgressArbitrary = fc
    .tuple(progressRecordArbitrary, fc.subarray(stepIds))
    .map(([progress, completedStepIds]) => ({
      ...progress,
      tutorialId: definition.id,
      currentStepId: firstStepId,
      completedStepIds,
    }));

  return fc.record({
    definition: fc.constant(definition),
    progress: fc.option(matchingProgressArbitrary, { nil: undefined }),
  });
});

describe('presentTutorialCard Property 9', () => {
  // Feature: guided-user-tutorials, Property 9: Catalog card completeness
  // **Validates: Requirements 2.4, 2.5, 2.6, 3.1**
  it('includes complete metadata, current status, and calculated progress when a record exists', () => {
    fc.assert(
      fc.property(catalogCardScenarioArbitrary, ({ definition, progress }) => {
        const expectedStatus = progress?.status ?? 'NOT_STARTED';
        const expectedPercentage =
          progress === undefined
            ? undefined
            : progressPercentage(
                new Set(progress.completedStepIds).size,
                definition.metadata.stepCount,
              );
        const presentationItem: TutorialCatalogPresentationItem = {
          id: definition.id,
          ...definition.metadata,
          status: expectedStatus,
          ...(expectedPercentage === undefined ? {} : { progressPercentage: expectedPercentage }),
        };

        const card = presentTutorialCard(presentationItem);

        expect(card).toEqual({
          id: definition.id,
          title: definition.metadata.title,
          summary: definition.metadata.summary,
          category: definition.metadata.category,
          learningOutcomes: definition.metadata.learningOutcomes,
          estimatedMinutes: definition.metadata.estimatedMinutes,
          stepCount: definition.metadata.stepCount,
          status: expectedStatus,
          ...(expectedPercentage === undefined ? {} : { progressPercentage: expectedPercentage }),
        });
        expect('progressPercentage' in card).toBe(progress !== undefined);
      }),
      { numRuns: 100 },
    );
  });
});
