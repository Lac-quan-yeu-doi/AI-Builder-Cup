import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { createListTutorialCatalogUseCase } from '@/src/application/use-cases/tutorials/list-tutorial-catalog.use-case';
import type { OnboardingDecision } from '@/src/entities/models/onboarding';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type {
  PublicationResult,
  TutorialDefinition,
} from '@/src/entities/models/tutorial-definition';
import type {
  CompletionRecord,
  ProgressRecord,
  TutorialStatus,
} from '@/src/entities/models/tutorial-progress';
import {
  tutorialDefinitionsArbitrary,
  type GeneratedTutorialDefinition,
} from '@/tests/unit/entities/tutorial-arbitraries';

interface CatalogAccessFixture {
  readonly accessibleTutorials: readonly PublishedCatalogTutorial[];
  readonly inaccessibleTutorials: readonly PublishedCatalogTutorial[];
  readonly retainedInaccessibleProgress: readonly ProgressRecord[];
}

const fixtureSeedArbitrary = fc.stringMatching(/^[a-z0-9]{1,12}$/);
const tutorialStatusArbitrary = fc.constantFrom<TutorialStatus>(
  'NOT_STARTED',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
);

function toCatalogTutorial(
  definition: GeneratedTutorialDefinition,
  access: 'accessible' | 'inaccessible',
  seed: string,
  index: number,
): PublishedCatalogTutorial {
  const marker = `${access}-${seed}-${index}`;

  return {
    id: marker,
    title: `${marker}-title-${definition.metadata.title}`,
    summary: `${marker}-summary-${definition.metadata.summary}`,
    category: `${marker}-category-${definition.metadata.category}`,
    learningOutcomes: definition.metadata.learningOutcomes.map(
      (outcome, outcomeIndex) => `${marker}-outcome-${outcomeIndex}-${outcome}`,
    ),
    estimatedMinutes: definition.metadata.estimatedMinutes,
    stepCount: definition.metadata.stepCount,
  };
}

function toRetainedProgress(
  tutorial: PublishedCatalogTutorial,
  status: TutorialStatus,
): ProgressRecord {
  return {
    tutorialId: tutorial.id,
    memberId: 'member-with-retained-progress',
    organizationId: 'current-organization',
    status,
    currentStepId: `current-step-${tutorial.id}`,
    completedStepIds: [`completed-step-${tutorial.id}`],
    contextSelections: [
      {
        requirementId: `requirement-${tutorial.id}`,
        resourceType: 'DATABASE',
        resourceId: `resource-${tutorial.id}`,
      },
    ],
    updatedAt: '2026-08-10T01:00:00.000Z',
  };
}

const catalogAccessFixtureArbitrary: fc.Arbitrary<CatalogAccessFixture> = fc
  .tuple(
    tutorialDefinitionsArbitrary,
    tutorialDefinitionsArbitrary,
    fixtureSeedArbitrary,
    fc.array(tutorialStatusArbitrary, { minLength: 12, maxLength: 12 }),
  )
  .map(([accessibleDefinitions, inaccessibleDefinitions, seed, statuses]) => {
    const accessibleTutorials = accessibleDefinitions.map((definition, index) =>
      toCatalogTutorial(definition, 'accessible', seed, index),
    );
    const inaccessibleTutorials = inaccessibleDefinitions.map((definition, index) =>
      toCatalogTutorial(definition, 'inaccessible', seed, index),
    );
    const retainedInaccessibleProgress = inaccessibleTutorials.map((tutorial, index) =>
      toRetainedProgress(tutorial, statuses[index] ?? 'NOT_STARTED'),
    );

    return {
      accessibleTutorials,
      inaccessibleTutorials,
      retainedInaccessibleProgress,
    };
  });

class AccessibleOnlyTutorialRepository implements TutorialRepository {
  public constructor(private readonly accessibleTutorials: readonly PublishedCatalogTutorial[]) {}

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    return this.accessibleTutorials;
  }

  public async getDefinition(): Promise<TutorialDefinition> {
    throw new Error('Not used by list tutorial catalog.');
  }

  public async publish(): Promise<PublicationResult> {
    throw new Error('Not used by list tutorial catalog.');
  }
}

class RetainedProgressRepository implements TutorialProgressRepository {
  public constructor(private readonly progressRecords: readonly ProgressRecord[]) {}

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    return this.progressRecords;
  }

  public async save(): Promise<ProgressRecord> {
    throw new Error('Not used by list tutorial catalog.');
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    throw new Error('Not used by list tutorial catalog.');
  }

  public async saveOnboardingDecision(): Promise<OnboardingDecision> {
    throw new Error('Not used by list tutorial catalog.');
  }

  public async saveCompletion(): Promise<CompletionRecord> {
    throw new Error('Not used by list tutorial catalog.');
  }
}

describe('list tutorial catalog Property 33', () => {
  // Feature: guided-user-tutorials, Property 33: The catalog exposes only accessible tutorials and never inaccessible details
  // **Validates: Requirements 12.1, 12.3, 12.10**
  it('omits inaccessible tutorials even when their progress is retained', async () => {
    await fc.assert(
      fc.asyncProperty(
        catalogAccessFixtureArbitrary,
        async ({ accessibleTutorials, inaccessibleTutorials, retainedInaccessibleProgress }) => {
          const listCatalog = createListTutorialCatalogUseCase(
            new AccessibleOnlyTutorialRepository(accessibleTutorials),
            new RetainedProgressRepository(retainedInaccessibleProgress),
          );

          const result = await listCatalog({ searchTerm: '', statusFilters: [] });

          expect(result).toEqual(
            accessibleTutorials.map((tutorial) => ({
              ...tutorial,
              learningOutcomes: [...tutorial.learningOutcomes],
              status: 'NOT_STARTED',
            })),
          );

          const serializedResult = JSON.stringify(result);
          for (const tutorial of inaccessibleTutorials) {
            expect(result.some(({ id }) => id === tutorial.id)).toBe(false);
            for (const inaccessibleDetail of [
              tutorial.id,
              tutorial.title,
              tutorial.summary,
              tutorial.category,
              ...tutorial.learningOutcomes,
            ]) {
              expect(serializedResult).not.toContain(inaccessibleDetail);
            }
          }
          for (const progress of retainedInaccessibleProgress) {
            expect(result.some(({ id }) => id === progress.tutorialId)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
