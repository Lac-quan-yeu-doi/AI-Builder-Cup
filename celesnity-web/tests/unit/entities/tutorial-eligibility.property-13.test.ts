import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluateEligibility } from '@/src/entities/models/tutorial-eligibility';
import {
  eligibilityInputArbitrary,
  type GeneratedEligibilityInput,
} from '@/tests/unit/entities/tutorial-arbitraries';

function expectedBlockers(input: GeneratedEligibilityInput) {
  const accessibleFeatures = new Set(input.accessibleFeatures);
  const blockingFeatureIds = input.requiredFeatures.filter(
    (feature) => !accessibleFeatures.has(feature),
  );
  const unsatisfiedPrerequisiteIds = input.prerequisiteStates
    .filter((prerequisite) => !prerequisite.satisfied)
    .map((prerequisite) => prerequisite.id);
  const unfilledContextRequirementIds = input.contextRequirements
    .filter((requirement) => {
      const selectedResourceIds = new Set(
        input.contextSelections
          .filter(
            (selection) =>
              selection.requirementId === requirement.id &&
              selection.resourceType === requirement.resourceType &&
              selection.resourceId.trim().length > 0,
          )
          .map((selection) => selection.resourceId),
      );

      return selectedResourceIds.size < requirement.selectionCount;
    })
    .map((requirement) => requirement.id);

  return {
    blockingFeatureIds,
    unsatisfiedPrerequisiteIds,
    unfilledContextRequirementIds,
  };
}

describe('evaluateEligibility Property 13', () => {
  // Feature: guided-user-tutorials, Property 13: Start is available exactly when there are no blocking conditions
  // **Validates: Requirements 3.5, 3.8, 3.12, 3.13, 10.8, 10.9, 10.10, 10.12**
  it('reports eligibility exactly when every complete blocker list is empty', () => {
    fc.assert(
      fc.property(eligibilityInputArbitrary, (input) => {
        const result = evaluateEligibility(input);
        const expected = expectedBlockers(input);
        const expectedEligible =
          expected.blockingFeatureIds.length === 0 &&
          expected.unsatisfiedPrerequisiteIds.length === 0 &&
          expected.unfilledContextRequirementIds.length === 0;
        const reportedBlockersAreEmpty =
          result.blockingFeatureIds.length === 0 &&
          result.unsatisfiedPrerequisiteIds.length === 0 &&
          result.unfilledContextRequirementIds.length === 0;

        expect(result.blockingFeatureIds).toEqual(expected.blockingFeatureIds);
        expect(result.unsatisfiedPrerequisiteIds).toEqual(expected.unsatisfiedPrerequisiteIds);
        expect(result.unfilledContextRequirementIds).toEqual(
          expected.unfilledContextRequirementIds,
        );
        expect(result.eligible).toBe(expectedEligible);
        expect(result.eligible).toBe(reportedBlockersAreEmpty);
      }),
      { numRuns: 100 },
    );
  });
});
