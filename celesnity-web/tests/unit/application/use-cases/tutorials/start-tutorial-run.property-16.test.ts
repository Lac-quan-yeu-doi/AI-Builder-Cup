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
  TutorialId,
} from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { tutorialDefinitionArbitrary } from '@/tests/unit/entities/tutorial-arbitraries';

const startedAt = '2027-01-02T03:04:05.000Z';
const identityArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);

class GeneratedTutorialRepository implements TutorialRepository {
  public readonly requestedIds: TutorialId[] = [];

  public constructor(private readonly definition: TutorialDefinition) {}

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    throw new Error('Not used when starting a tutorial run.');
  }

  public async getDefinition(id: TutorialId): Promise<TutorialDefinition> {
    this.requestedIds.push(id);
    return this.definition;
  }

  public async publish(): Promise<PublicationResult> {
    throw new Error('Not used when starting a tutorial run.');
  }
}

class EmptyProgressRepository implements TutorialProgressRepository {
  public readonly savedRecords: ProgressRecord[] = [];

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    return [];
  }

  public async save(record: ProgressRecord): Promise<ProgressRecord> {
    this.savedRecords.push(record);
    return record;
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    throw new Error('Not used when starting a tutorial run.');
  }

  public async saveOnboardingDecision(): Promise<OnboardingDecision> {
    throw new Error('Not used when starting a tutorial run.');
  }

  public async saveCompletion(): Promise<CompletionRecord> {
    throw new Error('Not used when starting a tutorial run.');
  }
}

describe('start tutorial run Property 16', () => {
  // Feature: guided-user-tutorials, Property 16: Starting an eligible tutorial creates exactly one run at the first step, In Progress
  // **Validates: Requirements 5.1, 5.2**
  it('saves exactly one IN_PROGRESS run at the first ordered step', async () => {
    await fc.assert(
      fc.asyncProperty(
        tutorialDefinitionArbitrary,
        identityArbitrary,
        identityArbitrary,
        async (generatedDefinition, memberId, organizationId) => {
          const definition: TutorialDefinition = {
            ...generatedDefinition,
            requiredFeatures: [],
            prerequisites: [],
            contextRequirements: [],
          };
          const tutorialRepository = new GeneratedTutorialRepository(definition);
          const progressRepository = new EmptyProgressRepository();
          const start = createStartTutorialRunUseCase({
            tutorialRepository,
            progressRepository,
            now: () => startedAt,
          });
          const firstStep = [...definition.steps].sort(
            (left, right) => left.order - right.order,
          )[0];

          if (firstStep === undefined) {
            throw new RangeError('Generated tutorial definitions must contain a step.');
          }

          const result = await start({
            tutorialId: definition.id,
            memberId,
            organizationId,
            contextSelections: [],
          });

          expect(progressRepository.savedRecords).toHaveLength(1);
          expect(progressRepository.savedRecords[0]).toEqual({
            tutorialId: definition.id,
            memberId,
            organizationId,
            status: 'IN_PROGRESS',
            currentStepId: firstStep.id,
            completedStepIds: [],
            contextSelections: [],
            updatedAt: startedAt,
          });
          expect(tutorialRepository.requestedIds).toEqual([definition.id]);
          expect(result).toEqual({
            outcome: 'STARTED',
            run: progressRepository.savedRecords[0],
            destinationHref: firstStep.destinationHref,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
