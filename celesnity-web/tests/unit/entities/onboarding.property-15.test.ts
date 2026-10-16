import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  selectAccessibleRecommendation,
  type OnboardingRecommendationCandidate,
} from '@/src/entities/models/onboarding';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';
import { workspaceFeatureArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

interface RecommendationCandidate extends OnboardingRecommendationCandidate {
  readonly id: string;
}

interface RecommendationScenario {
  readonly candidates: readonly RecommendationCandidate[];
  readonly accessibleFeatures: readonly WorkspaceFeature[];
}

const recommendationScenarioArbitrary: fc.Arbitrary<RecommendationScenario> = fc
  .uniqueArray(workspaceFeatureArbitrary)
  .chain((accessibleFeatures) =>
    fc
      .record({
        precedingRequirements: fc.array(fc.uniqueArray(workspaceFeatureArbitrary), {
          maxLength: 8,
        }),
        guaranteedAccessibleRequirements: fc.subarray(accessibleFeatures),
      })
      .map(({ precedingRequirements, guaranteedAccessibleRequirements }) => ({
        accessibleFeatures,
        candidates: [
          ...precedingRequirements.map((requiredFeatures, index) => ({
            id: `candidate-${index}`,
            requiredFeatures,
          })),
          {
            id: 'guaranteed-accessible-candidate',
            requiredFeatures: guaranteedAccessibleRequirements,
          },
        ],
      })),
  );

describe('selectAccessibleRecommendation Property 15', () => {
  // Feature: guided-user-tutorials, Property 15: An onboarding recommendation is accessible when one exists
  // **Validates: Requirements 4.3**
  it('returns a recommendation requiring only features the member can access', () => {
    fc.assert(
      fc.property(recommendationScenarioArbitrary, ({ candidates, accessibleFeatures }) => {
        const recommendation = selectAccessibleRecommendation(candidates, accessibleFeatures);

        expect(recommendation).not.toBeNull();
        if (recommendation === null) {
          return;
        }

        const accessibleFeatureSet = new Set(accessibleFeatures);

        expect(candidates).toContain(recommendation);
        expect(
          recommendation.requiredFeatures.every((feature) => accessibleFeatureSet.has(feature)),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
