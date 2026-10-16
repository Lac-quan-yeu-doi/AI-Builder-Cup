import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { selectAccessibleRecommendation } from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import { workspaceFeatures } from '@/src/entities/models/workspace-feature';
import { presentCompletionSummary } from '@/src/interface-adapters/presenters/completion.presenter';
import {
  tutorialDefinitionArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

const completionTimestampArbitrary = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((timestamp) => new Date(timestamp).toISOString());

const completionSummaryScenarioArbitrary = fc
  .uniqueArray(tutorialDefinitionArbitrary, {
    minLength: 2,
    maxLength: 8,
    selector: (definition) => definition.id,
  })
  .chain((definitions) =>
    fc.record({
      definitions: fc.constant(definitions),
      completedAt: completionTimestampArbitrary,
    }),
  );

function asPublishedCatalogTutorial(
  definition: GeneratedTutorialDefinition,
): PublishedCatalogTutorial {
  return {
    id: definition.id,
    ...definition.metadata,
  };
}

describe('presentCompletionSummary Property 31', () => {
  // Feature: guided-user-tutorials, Property 31: Completion summary completeness and next recommendation
  // **Validates: Requirements 11.3, 11.5**
  it('includes every completion detail and recommends another eligible catalog tutorial', () => {
    fc.assert(
      fc.property(completionSummaryScenarioArbitrary, ({ definitions, completedAt }) => {
        const completedDefinition = definitions[0];
        const catalogCandidates = definitions.slice(1);
        const eligibleDefinition = selectAccessibleRecommendation(
          catalogCandidates,
          workspaceFeatures,
        );

        if (completedDefinition === undefined || eligibleDefinition === null) {
          throw new RangeError('A completion summary scenario requires two tutorials.');
        }

        const eligibleCatalog = catalogCandidates.map(asPublishedCatalogTutorial);
        const eligibleRecommendation = asPublishedCatalogTutorial(eligibleDefinition);
        const accessibleFeatureSet = new Set(workspaceFeatures);
        const viewModel = presentCompletionSummary({
          definition: completedDefinition as TutorialDefinition,
          completion: {
            runId: `completed-${completedDefinition.id}`,
            completedAt,
          },
          nextRecommendation: eligibleRecommendation,
          locale: 'en',
          fallbackLocale: { code: 'en', name: 'English' },
        });

        expect(viewModel.title).toBe(completedDefinition.metadata.title);
        expect(viewModel.outcomes).toEqual(completedDefinition.metadata.learningOutcomes);
        expect(viewModel.completedAt).toBe(completedAt);
        expect(viewModel.nextRecommendation).not.toBeNull();

        if (viewModel.nextRecommendation === null) {
          throw new Error('An eligible tutorial must produce a next recommendation.');
        }

        expect(viewModel.nextRecommendation).toEqual({
          tutorialId: eligibleRecommendation.id,
          title: eligibleRecommendation.title,
        });
        expect(viewModel.nextRecommendation.tutorialId).not.toBe(completedDefinition.id);
        expect(
          eligibleDefinition.requiredFeatures.every((feature) => accessibleFeatureSet.has(feature)),
        ).toBe(true);
        expect(
          eligibleCatalog.some(
            (tutorial) => tutorial.id === viewModel.nextRecommendation?.tutorialId,
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
