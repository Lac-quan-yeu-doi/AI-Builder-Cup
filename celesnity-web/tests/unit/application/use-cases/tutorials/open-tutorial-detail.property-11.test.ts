import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import { createOpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type {
  ContextRequirement,
  TutorialDefinition,
} from '@/src/entities/models/tutorial-definition';
import {
  contextRequirementArbitrary,
  mixedAuthorizationResourcesArbitrary,
  type GeneratedContextResource,
} from '@/tests/unit/entities/tutorial-arbitraries';

const contextRequirementsArbitrary = fc.uniqueArray(contextRequirementArbitrary, {
  minLength: 1,
  maxLength: 5,
  selector: (requirement) => requirement.id,
});

function createDefinition(contextRequirements: readonly ContextRequirement[]): TutorialDefinition {
  return {
    id: 'authorized-context-selectors',
    metadata: {
      title: 'Authorized context selectors',
      summary: 'Select authorized workspace resources.',
      category: 'Workspace',
      learningOutcomes: ['Select tutorial context'],
      estimatedMinutes: 5,
      stepCount: 1,
    },
    steps: [
      {
        id: 'select-context',
        order: 1,
        title: 'Select context',
        instructionalContent: 'Choose the required resources.',
        destinationFeature: 'QUERY',
        destinationHref: '/query',
      },
    ],
    requiredFeatures: [],
    prerequisites: [],
    contextRequirements,
  };
}

function asContextResource(resource: GeneratedContextResource): ContextResource {
  return {
    id: resource.id,
    name: resource.name,
    resourceType: resource.resourceType,
  };
}

describe('open tutorial detail Property 11', () => {
  // Feature: guided-user-tutorials, Property 11: One selector per required context selection, limited to authorized matching resources
  // **Validates: Requirements 3.6, 3.7, 12.2**
  it('builds the required selectors with exactly the authorized matching-type options', async () => {
    await fc.assert(
      fc.asyncProperty(
        contextRequirementsArbitrary,
        mixedAuthorizationResourcesArbitrary,
        async (contextRequirements, resources) => {
          const definition = createDefinition(contextRequirements);
          const authorizedResources = resources
            .filter((resource) => resource.authorized)
            .map(asContextResource);
          const repository: TutorialRepository = {
            listAccessibleCatalog: async () => [],
            getDefinition: async () => definition,
            publish: async () => ({ ok: true }),
          };
          const featureAccessService: TutorialFeatureAccessService = {
            accessibleFeatures: async () => [],
          };
          const workspaceContextService: WorkspaceContextService = {
            listAuthorizedResources: async () => authorizedResources,
            isResourceStillValid: async () => true,
          };
          const openDetail = createOpenTutorialDetailUseCase(
            repository,
            featureAccessService,
            workspaceContextService,
          );

          const result = await openDetail({
            tutorialId: definition.id,
            prerequisiteEvaluations: [],
            contextSelections: [],
          });

          expect(result.contextSelectors).toHaveLength(
            contextRequirements.reduce(
              (total, requirement) => total + requirement.selectionCount,
              0,
            ),
          );

          contextRequirements.forEach((requirement) => {
            const selectors = result.contextSelectors.filter(
              (selector) => selector.requirementId === requirement.id,
            );
            const expectedOptions = authorizedResources.filter(
              (resource) => resource.resourceType === requirement.resourceType,
            );

            expect(selectors).toHaveLength(requirement.selectionCount);
            selectors.forEach((selector) => {
              expect(selector.resourceType).toBe(requirement.resourceType);
              expect(selector.options).toEqual(expectedOptions);
            });
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
