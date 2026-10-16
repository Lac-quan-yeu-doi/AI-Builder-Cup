import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type { WorkspaceContextService } from '@/src/application/services/workspace-context.service.interface';
import { createResumeTutorialRunUseCase } from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import { TutorialAccessError } from '@/src/entities/errors/application-errors';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

const inaccessibleProgressArbitrary: fc.Arbitrary<ProgressRecord> = progressRecordArbitrary.map(
  ({ contextSelections, ...record }) => ({
    ...record,
    tutorialId: `inaccessible-tutorial-${record.tutorialId}-marker`,
    status: 'PAUSED',
    currentStepId: `inaccessible-step-${record.currentStepId}-marker`,
    completedStepIds: record.completedStepIds.map(
      (stepId) => `inaccessible-completed-step-${stepId}-marker`,
    ),
    contextSelections: contextSelections.map(({ requirementId, resourceType, resourceId }) => ({
      requirementId: `inaccessible-requirement-${requirementId}-marker`,
      resourceType,
      resourceId: `inaccessible-resource-${resourceId}-marker`,
    })),
  }),
);

class InaccessibleTutorialRepository {
  public definitionLoadCount = 0;

  public catalogLoadCount = 0;

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    this.catalogLoadCount += 1;
    return [];
  }

  public async getDefinition(): Promise<TutorialDefinition> {
    this.definitionLoadCount += 1;
    throw new Error('An inaccessible tutorial definition must not be loaded.');
  }
}

class UnusedProgressRepository {
  public listCount = 0;

  public saveCount = 0;

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    this.listCount += 1;
    throw new Error('Inaccessible saved progress must not be listed for conflict resolution.');
  }

  public async save(): Promise<ProgressRecord> {
    this.saveCount += 1;
    throw new Error('Inaccessible saved progress must not be overwritten.');
  }
}

class UnusedFeatureAccessService implements TutorialFeatureAccessService {
  public callCount = 0;

  public async accessibleFeatures(): Promise<readonly never[]> {
    this.callCount += 1;
    throw new Error('Feature access must not be queried for an inaccessible tutorial.');
  }
}

class UnusedWorkspaceContextService implements WorkspaceContextService {
  public listCount = 0;

  public validationCount = 0;

  public async listAuthorizedResources(): Promise<readonly never[]> {
    this.listCount += 1;
    throw new Error('Resources must not be listed for an inaccessible tutorial.');
  }

  public async isResourceStillValid(): Promise<boolean> {
    this.validationCount += 1;
    throw new Error('Resources must not be validated for an inaccessible tutorial.');
  }
}

function inaccessibleDetails(progress: ProgressRecord): readonly string[] {
  return [
    progress.tutorialId,
    progress.currentStepId,
    ...progress.completedStepIds,
    ...progress.contextSelections.flatMap((selection) => [
      selection.requirementId,
      selection.resourceId,
    ]),
  ];
}

describe('resume tutorial run Property 35', () => {
  // Feature: guided-user-tutorials, Property 35: Resume is unavailable while a saved tutorial is inaccessible
  // **Validates: Requirements 12.10, 12.11**
  it('retains arbitrary saved progress and fails safely before loading inaccessible details', async () => {
    await fc.assert(
      fc.asyncProperty(inaccessibleProgressArbitrary, async (progress) => {
        const tutorialRepository = new InaccessibleTutorialRepository();
        const progressRepository = new UnusedProgressRepository();
        const featureAccessService = new UnusedFeatureAccessService();
        const workspaceContextService = new UnusedWorkspaceContextService();
        const resume = createResumeTutorialRunUseCase({
          tutorialRepository: tutorialRepository satisfies Pick<
            TutorialRepository,
            'getDefinition' | 'listAccessibleCatalog'
          >,
          progressRepository: progressRepository satisfies Pick<
            TutorialProgressRepository,
            'listForMember' | 'save'
          >,
          featureAccessService,
          workspaceContextService,
        });
        const persistedBeforeResume = JSON.stringify(progress);

        let caught: unknown;
        try {
          await resume({
            progress,
            prerequisiteEvaluations: [],
            replacementContextSelections: [],
            destinationReady: true,
            resumedAt: '2027-03-04T05:06:07.000Z',
          });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(TutorialAccessError);
        if (!(caught instanceof TutorialAccessError)) {
          throw new Error('Expected resume to fail with TutorialAccessError.');
        }

        expect(caught).toEqual(new TutorialAccessError());
        expect(JSON.stringify(progress)).toBe(persistedBeforeResume);
        expect(tutorialRepository.catalogLoadCount).toBe(1);
        expect(tutorialRepository.definitionLoadCount).toBe(0);
        expect(progressRepository.saveCount).toBe(0);
        expect(featureAccessService.callCount).toBe(0);
        expect(workspaceContextService.listCount).toBe(0);
        expect(workspaceContextService.validationCount).toBe(0);

        const serializedError = JSON.stringify({
          name: caught.name,
          message: caught.message,
          cause: caught.cause,
          enumerableProperties: { ...caught },
        });
        for (const inaccessibleDetail of inaccessibleDetails(progress)) {
          expect(serializedError).not.toContain(inaccessibleDetail);
        }
      }),
      { numRuns: 100 },
    );
  });
});
