import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import { createOpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import { resourceTypeValues } from '@/tests/unit/entities/tutorial-arbitraries';

interface GeneratedSelection {
  readonly requirementId: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly resourceType: (typeof resourceTypeValues)[number];
}

interface ContextAvailabilityScenario {
  readonly selections: readonly GeneratedSelection[];
  readonly invalidResourceIds: ReadonlySet<string>;
}

const selectionArbitrary: fc.Arbitrary<GeneratedSelection> = fc.record({
  requirementId: fc.uuid(),
  resourceId: fc.uuid(),
  resourceName: fc.stringMatching(/^[A-Za-z][A-Za-z0-9 -]{0,39}$/),
  resourceType: fc.constantFrom(...resourceTypeValues),
});

const contextAvailabilityScenarioArbitrary: fc.Arbitrary<ContextAvailabilityScenario> = fc
  .uniqueArray(selectionArbitrary, {
    minLength: 1,
    maxLength: 8,
    selector: (selection) => selection.requirementId,
  })
  .chain((selections) =>
    fc
      .subarray(
        selections.map(({ resourceId }) => resourceId),
        { minLength: 1 },
      )
      .map((invalidResourceIds) => ({
        selections,
        invalidResourceIds: new Set(invalidResourceIds),
      })),
  );

function createDefinition(selections: readonly GeneratedSelection[]): TutorialDefinition {
  return {
    id: 'context-validity-tutorial',
    metadata: {
      title: 'Context validity',
      summary: 'Validate selected workspace context.',
      category: 'Workspace',
      learningOutcomes: ['Choose valid context'],
      estimatedMinutes: 5,
      stepCount: 1,
    },
    steps: [
      {
        id: 'select-context',
        order: 1,
        title: 'Select context',
        instructionalContent: 'Select every required resource.',
        destinationFeature: 'HOME',
        destinationHref: '/home',
      },
    ],
    requiredFeatures: [],
    prerequisites: [],
    contextRequirements: selections.map((selection) => ({
      id: selection.requirementId,
      resourceType: selection.resourceType,
      selectionCount: 1,
    })),
  };
}

function createRepository(definition: TutorialDefinition): TutorialRepository {
  return {
    listAccessibleCatalog: async () => [],
    getDefinition: async () => definition,
    publish: async () => ({ ok: true }),
  };
}

function createFeatureAccessService(): TutorialFeatureAccessService {
  return {
    accessibleFeatures: async () => [],
  };
}

function createContextService(
  selections: readonly GeneratedSelection[],
  invalidResourceIds: ReadonlySet<string>,
): WorkspaceContextService {
  const resources: readonly ContextResource[] = selections.map((selection) => ({
    id: selection.resourceId,
    name: selection.resourceName,
    resourceType: selection.resourceType,
  }));

  return {
    listAuthorizedResources: async (resourceType) =>
      resources.filter((resource) => resource.resourceType === resourceType),
    isResourceStillValid: async (_resourceType, resourceId) => !invalidResourceIds.has(resourceId),
  };
}

describe('open tutorial detail Property 12', () => {
  // Feature: guided-user-tutorials, Property 12: Only invalid context selections are cleared and their requirements are flagged
  // **Validates: Requirements 3.10, 3.11, 10.11**
  it('clears exactly an arbitrary unavailable subset while retaining all valid selections', async () => {
    await fc.assert(
      fc.asyncProperty(
        contextAvailabilityScenarioArbitrary,
        async ({ selections, invalidResourceIds }) => {
          const definition = createDefinition(selections);
          const openDetail = createOpenTutorialDetailUseCase(
            createRepository(definition),
            createFeatureAccessService(),
            createContextService(selections, invalidResourceIds),
          );

          const result = await openDetail({
            tutorialId: definition.id,
            prerequisiteEvaluations: [],
            contextSelections: selections.map((selection) => ({
              requirementId: selection.requirementId,
              resourceType: selection.resourceType,
              resourceId: selection.resourceId,
            })),
          });
          const validSelections = selections.filter(
            (selection) => !invalidResourceIds.has(selection.resourceId),
          );
          const invalidSelections = selections.filter((selection) =>
            invalidResourceIds.has(selection.resourceId),
          );

          expect(result.contextSelections).toEqual(
            validSelections.map((selection) => ({
              requirementId: selection.requirementId,
              resourceType: selection.resourceType,
              resourceId: selection.resourceId,
              resourceName: selection.resourceName,
            })),
          );
          expect(result.replacementRequiredRequirementIds).toEqual(
            invalidSelections.map((selection) => selection.requirementId),
          );
          expect(result.eligibility.unfilledContextRequirementIds).toEqual(
            invalidSelections.map((selection) => selection.requirementId),
          );
          expect(result.contextSelectors).toHaveLength(selections.length);

          for (const selector of result.contextSelectors) {
            const selection = selections.find(
              ({ requirementId }) => requirementId === selector.requirementId,
            );
            expect(selection).toBeDefined();

            if (selection === undefined || invalidResourceIds.has(selection.resourceId)) {
              expect(selector.selectedResource).toBeNull();
            } else {
              expect(selector.selectedResource).toEqual({
                id: selection.resourceId,
                name: selection.resourceName,
                resourceType: selection.resourceType,
              });
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
