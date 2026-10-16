import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { createStartTutorialRunUseCase } from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  PublicationResult,
  TutorialDefinition,
} from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { progressRecordArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);

const activeProgressRecordArbitrary: fc.Arbitrary<ProgressRecord> = progressRecordArbitrary.map(
  ({ contextSelections, ...record }) => ({
    ...record,
    status: 'IN_PROGRESS',
    contextSelections: contextSelections.map(({ requirementId, resourceType, resourceId }) => ({
      requirementId,
      resourceType,
      resourceId,
    })),
  }),
);

class UnusedTutorialRepository implements TutorialRepository {
  public definitionLoadCount = 0;

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    throw new Error('Not used when cancelling a conflicting tutorial start.');
  }

  public async getDefinition(): Promise<TutorialDefinition> {
    this.definitionLoadCount += 1;
    throw new Error('A cancelled tutorial start must not load the new definition.');
  }

  public async publish(): Promise<PublicationResult> {
    throw new Error('Not used when cancelling a conflicting tutorial start.');
  }
}

class ActiveProgressRepository implements TutorialProgressRepository {
  public saveCount = 0;

  public constructor(private readonly activeRun: ProgressRecord) {}

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    return [this.activeRun];
  }

  public async save(): Promise<ProgressRecord> {
    this.saveCount += 1;
    throw new Error('A cancelled tutorial start must not save progress.');
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    throw new Error('Not used when cancelling a conflicting tutorial start.');
  }

  public async saveOnboardingDecision(): Promise<OnboardingDecision> {
    throw new Error('Not used when cancelling a conflicting tutorial start.');
  }

  public async saveCompletion(): Promise<CompletionRecord> {
    throw new Error('Not used when cancelling a conflicting tutorial start.');
  }
}

describe('start tutorial run Property 18', () => {
  // Feature: guided-user-tutorials, Property 18: Cancelling a conflicting start preserves the active run
  // **Validates: Requirements 5.7**
  it('preserves the active run and performs no write or new definition load', async () => {
    await fc.assert(
      fc.asyncProperty(
        activeProgressRecordArbitrary,
        identifierArbitrary,
        async (activeRun, requestedTutorialId) => {
          const stateBeforeCancellation = {
            status: activeRun.status,
            currentStepId: activeRun.currentStepId,
            completedStepIds: [...activeRun.completedStepIds],
          };
          const tutorialRepository = new UnusedTutorialRepository();
          const progressRepository = new ActiveProgressRepository(activeRun);
          const start = createStartTutorialRunUseCase({
            tutorialRepository,
            progressRepository,
          });

          const result = await start({
            tutorialId: requestedTutorialId,
            memberId: activeRun.memberId,
            organizationId: activeRun.organizationId,
            contextSelections: [],
            conflictResolution: 'CANCEL_NEW_START',
          });

          expect(result.outcome).toBe('CANCELLED');
          if (result.outcome !== 'CANCELLED') {
            throw new Error('Expected the conflicting start to be cancelled.');
          }
          expect({
            status: result.activeRun.status,
            currentStepId: result.activeRun.currentStepId,
            completedStepIds: result.activeRun.completedStepIds,
          }).toEqual(stateBeforeCancellation);
          expect({
            status: activeRun.status,
            currentStepId: activeRun.currentStepId,
            completedStepIds: activeRun.completedStepIds,
          }).toEqual(stateBeforeCancellation);
          expect(progressRepository.saveCount).toBe(0);
          expect(tutorialRepository.definitionLoadCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
