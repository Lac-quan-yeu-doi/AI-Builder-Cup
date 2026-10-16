import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import {
  createStartTutorialRunUseCase,
  type StartTutorialConflictResolution,
} from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  PublicationResult,
  TutorialDefinition,
  TutorialId,
} from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';
import {
  tutorialDefinitionsArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

const timestamp = '2027-01-02T03:04:05.000Z';
const identityArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,23}$/);
const conflictResolutionArbitrary = fc.constantFrom<StartTutorialConflictResolution | undefined>(
  undefined,
  'PAUSE_ACTIVE',
  'CANCEL_NEW_START',
);

interface StartAttempt {
  readonly tutorialIndex: number;
  readonly conflictResolution: StartTutorialConflictResolution | undefined;
}

interface StartSequence {
  readonly definitions: readonly GeneratedTutorialDefinition[];
  readonly memberId: string;
  readonly organizationId: string;
  readonly attempts: readonly StartAttempt[];
}

const startSequenceArbitrary: fc.Arbitrary<StartSequence> = fc
  .record({
    definitions: tutorialDefinitionsArbitrary,
    memberId: identityArbitrary,
    organizationId: identityArbitrary,
  })
  .chain(({ definitions, memberId, organizationId }) =>
    fc
      .array(
        fc.record({
          tutorialIndex: fc.integer({ min: 0, max: definitions.length - 1 }),
          conflictResolution: conflictResolutionArbitrary,
        }),
        { minLength: 1, maxLength: 24 },
      )
      .map((attempts) => ({ definitions, memberId, organizationId, attempts })),
  );

function asTutorialDefinition(
  generatedDefinition: GeneratedTutorialDefinition,
): TutorialDefinition {
  return {
    ...generatedDefinition,
    requiredFeatures: [],
    prerequisites: [],
    contextRequirements: [],
  };
}

class GeneratedTutorialRepository implements TutorialRepository {
  private readonly definitionsById: ReadonlyMap<TutorialId, TutorialDefinition>;

  public constructor(definitions: readonly TutorialDefinition[]) {
    this.definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    throw new Error('Not used when starting tutorial runs.');
  }

  public async getDefinition(id: TutorialId): Promise<TutorialDefinition> {
    const definition = this.definitionsById.get(id);
    if (definition === undefined) {
      throw new RangeError(`No generated tutorial definition exists for ${id}.`);
    }
    return definition;
  }

  public async publish(): Promise<PublicationResult> {
    throw new Error('Not used when starting tutorial runs.');
  }
}

class StatefulProgressRepository implements TutorialProgressRepository {
  private records: ProgressRecord[] = [];
  public maximumInProgressCount = 0;

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    return this.records;
  }

  public async save(record: ProgressRecord): Promise<ProgressRecord> {
    const persistedRecord: ProgressRecord = {
      ...record,
      completedStepIds: [...record.completedStepIds],
      contextSelections: record.contextSelections.map((selection) => ({ ...selection })),
    };
    const existingIndex = this.records.findIndex(
      (existing) =>
        existing.memberId === record.memberId &&
        existing.organizationId === record.organizationId &&
        existing.tutorialId === record.tutorialId,
    );

    if (existingIndex === -1) {
      this.records = [...this.records, persistedRecord];
    } else {
      this.records = this.records.map((existing, index) =>
        index === existingIndex ? persistedRecord : existing,
      );
    }

    this.maximumInProgressCount = Math.max(
      this.maximumInProgressCount,
      this.inProgressRuns(record.memberId, record.organizationId).length,
    );
    return persistedRecord;
  }

  public inProgressRuns(memberId: string, organizationId: string): readonly ProgressRecord[] {
    return this.records.filter(
      (record) =>
        record.memberId === memberId &&
        record.organizationId === organizationId &&
        record.status === 'IN_PROGRESS',
    );
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    throw new Error('Not used when starting tutorial runs.');
  }

  public async saveOnboardingDecision(): Promise<OnboardingDecision> {
    throw new Error('Not used when starting tutorial runs.');
  }

  public async saveCompletion(): Promise<CompletionRecord> {
    throw new Error('Not used when starting tutorial runs.');
  }
}

describe('start tutorial run Property 17', () => {
  // Feature: guided-user-tutorials, Property 17: At most one active run exists
  // **Validates: Requirements 5.5**
  it('keeps at most one IN_PROGRESS run across generated start attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        startSequenceArbitrary,
        async ({ definitions: generatedDefinitions, memberId, organizationId, attempts }) => {
          const definitions = generatedDefinitions.map(asTutorialDefinition);
          const tutorialRepository = new GeneratedTutorialRepository(definitions);
          const progressRepository = new StatefulProgressRepository();
          const start = createStartTutorialRunUseCase({
            tutorialRepository,
            progressRepository,
            now: () => timestamp,
          });

          for (const attempt of attempts) {
            const definition = definitions[attempt.tutorialIndex];
            if (definition === undefined) {
              throw new RangeError('Generated start attempt must reference a tutorial.');
            }

            await start({
              tutorialId: definition.id,
              memberId,
              organizationId,
              contextSelections: [],
              conflictResolution: attempt.conflictResolution,
            });

            expect(
              progressRepository.inProgressRuns(memberId, organizationId).length,
            ).toBeLessThanOrEqual(1);
          }

          expect(progressRepository.maximumInProgressCount).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
