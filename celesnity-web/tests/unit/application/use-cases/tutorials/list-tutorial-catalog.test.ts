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
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';

const catalog: readonly PublishedCatalogTutorial[] = [
  {
    id: 'database-basics',
    title: 'Database Basics',
    summary: 'Create and inspect a database',
    category: 'Data management',
    learningOutcomes: ['Create a database'],
    estimatedMinutes: 10,
    stepCount: 2,
  },
  {
    id: 'streaming-pipeline',
    title: 'Streaming Pipeline',
    summary: 'Process data events continuously',
    category: 'Streaming',
    learningOutcomes: ['Build a pipeline'],
    estimatedMinutes: 15,
    stepCount: 3,
  },
];

const progress: ProgressRecord = {
  tutorialId: 'streaming-pipeline',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-2',
  completedStepIds: ['step-1', 'step-1'],
  contextSelections: [],
  updatedAt: '2026-08-10T01:00:00.000Z',
};

class FakeTutorialRepository implements TutorialRepository {
  public listCalls = 0;

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    this.listCalls += 1;
    return catalog;
  }

  public async getDefinition(): Promise<TutorialDefinition> {
    throw new Error('Not used by list tutorial catalog.');
  }

  public async publish(): Promise<PublicationResult> {
    throw new Error('Not used by list tutorial catalog.');
  }
}

class FakeTutorialProgressRepository implements TutorialProgressRepository {
  public listCalls = 0;

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    this.listCalls += 1;
    return [progress];
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

describe('list tutorial catalog use case', () => {
  it('attaches default and persisted statuses plus distinct-step progress', async () => {
    const tutorialRepository = new FakeTutorialRepository();
    const progressRepository = new FakeTutorialProgressRepository();
    const listCatalog = createListTutorialCatalogUseCase(tutorialRepository, progressRepository);

    const result = await listCatalog({ searchTerm: '', statusFilters: [] });

    expect(tutorialRepository.listCalls).toBe(1);
    expect(progressRepository.listCalls).toBe(1);
    expect(result).toEqual([
      {
        ...catalog[0],
        learningOutcomes: ['Create a database'],
        status: 'NOT_STARTED',
      },
      {
        ...catalog[1],
        learningOutcomes: ['Build a pipeline'],
        status: 'IN_PROGRESS',
        progressPercentage: 33,
      },
    ]);
    expect(result[0]).not.toHaveProperty('progressPercentage');
  });

  it('applies normalized metadata search and status filters after attaching progress', async () => {
    const listCatalog = createListTutorialCatalogUseCase(
      new FakeTutorialRepository(),
      new FakeTutorialProgressRepository(),
    );

    const result = await listCatalog({
      searchTerm: '  DATA EVENTS ',
      statusFilters: ['IN_PROGRESS'],
    });

    expect(result.map(({ id }) => id)).toEqual(['streaming-pipeline']);
  });

  it('returns an empty list when no accessible tutorial matches all active criteria', async () => {
    const listCatalog = createListTutorialCatalogUseCase(
      new FakeTutorialRepository(),
      new FakeTutorialProgressRepository(),
    );

    await expect(
      listCatalog({ searchTerm: 'database', statusFilters: ['COMPLETED'] }),
    ).resolves.toEqual([]);
  });
});
