import fc from 'fast-check';

import { workspaceFeatures, type WorkspaceFeature } from '@/src/entities/models/workspace-feature';

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);
const textArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,.:-]{0,79}$/);
const timestampArbitrary = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((timestamp) => new Date(timestamp).toISOString());

export const tutorialStatusValues = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED'] as const;
export type GeneratedTutorialStatus = (typeof tutorialStatusValues)[number];

export const resourceTypeValues = ['DATABASE', 'CONNECTION', 'PIPELINE'] as const;
export type GeneratedResourceType = (typeof resourceTypeValues)[number];

export interface GeneratedRequiredAction {
  readonly id: string;
  readonly accessibleName: string;
}

export interface GeneratedTargetControl {
  readonly id: string;
  readonly accessibleName: string;
  readonly selector: string;
}

export interface GeneratedTutorialStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly instructionalContent: string;
  readonly destinationFeature: WorkspaceFeature;
  readonly destinationHref: string;
  readonly requiredAction: GeneratedRequiredAction | undefined;
  readonly targetControl: GeneratedTargetControl | undefined;
}

export interface GeneratedContextRequirement {
  readonly id: string;
  readonly resourceType: GeneratedResourceType;
  readonly selectionCount: number;
}

export interface GeneratedPrerequisiteDescriptor {
  readonly id: string;
  readonly description: string;
}

export interface GeneratedTutorialDefinition {
  readonly id: string;
  readonly metadata: {
    readonly title: string;
    readonly summary: string;
    readonly category: string;
    readonly learningOutcomes: readonly string[];
    readonly estimatedMinutes: number;
    readonly stepCount: number;
  };
  readonly steps: readonly GeneratedTutorialStep[];
  readonly requiredFeatures: readonly WorkspaceFeature[];
  readonly prerequisites: readonly GeneratedPrerequisiteDescriptor[];
  readonly contextRequirements: readonly GeneratedContextRequirement[];
}

export interface GeneratedContextSelection {
  readonly requirementId: string;
  readonly resourceType: GeneratedResourceType;
  readonly resourceId: string;
  readonly resourceName: string;
}

export interface GeneratedProgressRecord {
  readonly tutorialId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly status: GeneratedTutorialStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly GeneratedContextSelection[];
  readonly updatedAt: string;
}

export interface GeneratedEligibilityInput {
  readonly requiredFeatures: readonly WorkspaceFeature[];
  readonly accessibleFeatures: readonly WorkspaceFeature[];
  readonly prerequisiteStates: readonly {
    readonly id: string;
    readonly satisfied: boolean;
  }[];
  readonly contextRequirements: readonly GeneratedContextRequirement[];
  readonly contextSelections: readonly GeneratedContextSelection[];
}

export interface GeneratedCatalogViewState {
  readonly search: string;
  readonly filters: readonly GeneratedTutorialStatus[];
  readonly scrollTop: number;
}

export interface GeneratedContextResource {
  readonly id: string;
  readonly name: string;
  readonly resourceType: GeneratedResourceType;
  readonly authorized: boolean;
}

export interface SensitiveValuePayloadFixture {
  readonly sensitiveValues: readonly string[];
  readonly payload: Readonly<Record<string, unknown>>;
}

export const workspaceFeatureArbitrary: fc.Arbitrary<WorkspaceFeature> = fc.constantFrom(
  ...workspaceFeatures,
);

const requiredActionArbitrary: fc.Arbitrary<GeneratedRequiredAction> = fc.record({
  id: identifierArbitrary,
  accessibleName: textArbitrary,
});

const targetControlArbitrary: fc.Arbitrary<GeneratedTargetControl> = fc.record({
  id: identifierArbitrary,
  accessibleName: textArbitrary,
  selector: identifierArbitrary.map((id) => `[data-tutorial-target="${id}"]`),
});

export const tutorialStepArbitrary: fc.Arbitrary<GeneratedTutorialStep> = fc.record({
  id: identifierArbitrary,
  order: fc.integer({ min: 1, max: 50 }),
  title: textArbitrary,
  instructionalContent: textArbitrary,
  destinationFeature: workspaceFeatureArbitrary,
  destinationHref: identifierArbitrary.map((segment) => `/workspace/${segment}`),
  requiredAction: fc.option(requiredActionArbitrary, { nil: undefined }),
  targetControl: fc.option(targetControlArbitrary, { nil: undefined }),
});

export const contextRequirementArbitrary: fc.Arbitrary<GeneratedContextRequirement> = fc.record({
  id: identifierArbitrary,
  resourceType: fc.constantFrom(...resourceTypeValues),
  selectionCount: fc.integer({ min: 1, max: 3 }),
});

const prerequisiteArbitrary: fc.Arbitrary<GeneratedPrerequisiteDescriptor> = fc.record({
  id: identifierArbitrary,
  description: textArbitrary,
});

const contextSelectionArbitrary: fc.Arbitrary<GeneratedContextSelection> = fc.record({
  requirementId: identifierArbitrary,
  resourceType: fc.constantFrom(...resourceTypeValues),
  resourceId: identifierArbitrary,
  resourceName: textArbitrary,
});

export const tutorialDefinitionArbitrary: fc.Arbitrary<GeneratedTutorialDefinition> = fc
  .record({
    id: identifierArbitrary,
    title: textArbitrary,
    summary: textArbitrary,
    category: textArbitrary,
    learningOutcomes: fc.array(textArbitrary, { minLength: 1, maxLength: 5 }),
    estimatedMinutes: fc.integer({ min: 1, max: 240 }),
    steps: fc.array(tutorialStepArbitrary, { minLength: 1, maxLength: 8 }),
    requiredFeatures: fc.uniqueArray(workspaceFeatureArbitrary),
    prerequisites: fc.uniqueArray(prerequisiteArbitrary, {
      selector: (prerequisite) => prerequisite.id,
    }),
    contextRequirements: fc.uniqueArray(contextRequirementArbitrary, {
      selector: (requirement) => requirement.id,
    }),
  })
  .map(({ title, summary, category, learningOutcomes, estimatedMinutes, steps, ...definition }) => {
    const orderedSteps = steps.map((step, index) => ({
      ...step,
      id: `${step.id}-${index + 1}`,
      order: index + 1,
    }));

    return {
      ...definition,
      metadata: {
        title,
        summary,
        category,
        learningOutcomes,
        estimatedMinutes,
        stepCount: orderedSteps.length,
      },
      steps: orderedSteps,
    };
  });

export const tutorialDefinitionsArbitrary: fc.Arbitrary<readonly GeneratedTutorialDefinition[]> =
  fc.uniqueArray(tutorialDefinitionArbitrary, {
    minLength: 1,
    maxLength: 12,
    selector: (definition) => definition.id,
  });

export const progressRecordArbitrary: fc.Arbitrary<GeneratedProgressRecord> = fc.record({
  tutorialId: identifierArbitrary,
  memberId: identifierArbitrary,
  organizationId: identifierArbitrary,
  status: fc.constantFrom(...tutorialStatusValues),
  currentStepId: identifierArbitrary,
  completedStepIds: fc.uniqueArray(identifierArbitrary, { maxLength: 12 }),
  contextSelections: fc.uniqueArray(contextSelectionArbitrary, {
    maxLength: 8,
    selector: (selection) => `${selection.requirementId}:${selection.resourceId}`,
  }),
  updatedAt: timestampArbitrary,
});

export const eligibilityInputArbitrary: fc.Arbitrary<GeneratedEligibilityInput> = fc.record({
  requiredFeatures: fc.uniqueArray(workspaceFeatureArbitrary),
  accessibleFeatures: fc.uniqueArray(workspaceFeatureArbitrary),
  prerequisiteStates: fc.uniqueArray(
    fc.record({ id: identifierArbitrary, satisfied: fc.boolean() }),
    { selector: (prerequisite) => prerequisite.id },
  ),
  contextRequirements: fc.uniqueArray(contextRequirementArbitrary, {
    selector: (requirement) => requirement.id,
  }),
  contextSelections: fc.uniqueArray(contextSelectionArbitrary, {
    selector: (selection) => `${selection.requirementId}:${selection.resourceId}`,
  }),
});

export const catalogViewStateArbitrary: fc.Arbitrary<GeneratedCatalogViewState> = fc.record({
  search: fc.string({ maxLength: 80 }),
  filters: fc.uniqueArray(fc.constantFrom(...tutorialStatusValues)),
  scrollTop: fc.integer({ min: 0, max: 100_000 }),
});

const contextResourceArbitrary: fc.Arbitrary<GeneratedContextResource> = fc.record({
  id: identifierArbitrary,
  name: textArbitrary,
  resourceType: fc.constantFrom(...resourceTypeValues),
  authorized: fc.boolean(),
});

export const mixedAuthorizationResourcesArbitrary: fc.Arbitrary<
  readonly GeneratedContextResource[]
> = fc
  .record({
    idPrefix: identifierArbitrary,
    firstType: fc.constantFrom(...resourceTypeValues),
    secondType: fc.constantFrom(...resourceTypeValues),
    firstName: textArbitrary,
    secondName: textArbitrary,
    extras: fc.array(contextResourceArbitrary, { maxLength: 8 }),
  })
  .filter(({ firstType, secondType }) => firstType !== secondType)
  .map(({ idPrefix, firstType, secondType, firstName, secondName, extras }) => [
    {
      id: `${idPrefix}-authorized-0`,
      name: firstName,
      resourceType: firstType,
      authorized: true,
    },
    {
      id: `${idPrefix}-unauthorized-1`,
      name: secondName,
      resourceType: secondType,
      authorized: false,
    },
    ...extras.map((resource, index) => ({
      ...resource,
      id: `${idPrefix}-extra-${index + 2}`,
    })),
  ]);

export const sensitiveValuePayloadArbitrary: fc.Arbitrary<SensitiveValuePayloadFixture> =
  identifierArbitrary.map((seed) => {
    const sensitiveValues = [
      `credential-${seed}`,
      `password-${seed}`,
      `token-${seed}`,
      `private-key-${seed}`,
    ] as const;

    return {
      sensitiveValues,
      payload: {
        id: `payload-${seed}`,
        displayName: 'Safe tutorial payload',
        authentication: {
          credential: sensitiveValues[0],
          password: sensitiveValues[1],
          token: sensitiveValues[2],
          privateKey: sensitiveValues[3],
        },
      },
    };
  });
