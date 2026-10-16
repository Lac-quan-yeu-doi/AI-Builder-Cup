import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

interface EligibilityContextRequirement {
  readonly id: string;
  readonly resourceType: string;
  readonly selectionCount: number;
}

interface EligibilityContextSelection {
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceName?: string;
}

export interface EligibilityInput {
  readonly requiredFeatures: readonly WorkspaceFeature[];
  readonly accessibleFeatures: readonly WorkspaceFeature[];
  readonly prerequisiteStates: readonly {
    readonly id: string;
    readonly satisfied: boolean;
  }[];
  readonly contextRequirements: readonly EligibilityContextRequirement[];
  readonly contextSelections: readonly EligibilityContextSelection[];
}

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly blockingFeatureIds: readonly WorkspaceFeature[];
  readonly unsatisfiedPrerequisiteIds: readonly string[];
  readonly unfilledContextRequirementIds: readonly string[];
}

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const accessibleFeatures = new Set(input.accessibleFeatures);
  const blockingFeatureIds = distinct(
    input.requiredFeatures.filter((feature) => !accessibleFeatures.has(feature)),
  );
  const unsatisfiedPrerequisiteIds = distinct(
    input.prerequisiteStates
      .filter((prerequisite) => !prerequisite.satisfied)
      .map((prerequisite) => prerequisite.id),
  );
  const unfilledContextRequirementIds = distinct(
    input.contextRequirements
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
      .map((requirement) => requirement.id),
  );

  return {
    eligible:
      blockingFeatureIds.length === 0 &&
      unsatisfiedPrerequisiteIds.length === 0 &&
      unfilledContextRequirementIds.length === 0,
    blockingFeatureIds,
    unsatisfiedPrerequisiteIds,
    unfilledContextRequirementIds,
  };
}
