import { describe, expect, it } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { createAdvanceTutorialStepUseCase } from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import type { TutorialDefinition, TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

const steps: readonly TutorialStep[] = [
  {
    id: 'step-1',
    order: 1,
    title: 'Choose a connection',
    instructionalContent: 'Choose the connection to query.',
    destinationFeature: 'CONNECTIONS',
    destinationHref: '/connections',
  },
  {
    id: 'step-2',
    order: 2,
    title: 'Run a query',
    instructionalContent: 'Run the guided query.',
    destinationFeature: 'QUERY',
    destinationHref: '/query',
    requiredAction: {
      id: 'run-query',
      accessibleName: 'Run query',
    },
  },
  {
    id: 'step-3',
    order: 3,
    title: 'Review the result',
    instructionalContent: 'Review the completed query.',
    destinationFeature: 'QUERY',
    destinationHref: '/query',
  },
];

const tutorialDefinition: TutorialDefinition = {
  id: 'tutorial-1',
  metadata: {
    title: 'Query a connection',
    summary: 'Learn the query workflow.',
    category: 'Query',
    learningOutcomes: ['Run a query'],
    estimatedMinutes: 5,
    stepCount: steps.length,
  },
  steps,
  requiredFeatures: ['CONNECTIONS', 'QUERY'],
  prerequisites: [],
  contextRequirements: [],
};

function progress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    tutorialId: tutorialDefinition.id,
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId: 'step-1',
    completedStepIds: [],
    contextSelections: [],
    updatedAt: '2026-09-01T09:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred promise was resolved before initialization.');
  };
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createTutorialRepository(): TutorialRepository {
  return {
    async listAccessibleCatalog() {
      return [];
    },
    async getDefinition() {
      return tutorialDefinition;
    },
    async publish() {
      return { ok: true };
    },
  };
}

function createProgressRepository(
  initialProgress: ProgressRecord,
  save: (record: ProgressRecord) => Promise<ProgressRecord>,
): TutorialProgressRepository {
  return {
    async listForMember() {
      return [initialProgress];
    },
    save,
    async getOnboardingDecision() {
      return null;
    },
    async saveOnboardingDecision(decision) {
      return decision;
    },
    async saveCompletion(runId) {
      return { runId, completedAt: '2026-09-01T10:00:00.000Z' };
    },
  };
}

describe('advance tutorial step ordering and action failures', () => {
  it('persists current-step completion before changing the current step for Next', async () => {
    const initialProgress = progress();
    const completionSave = deferred<ProgressRecord>();
    const completionSaveStarted = deferred<void>();
    const savedRecords: ProgressRecord[] = [];
    const progressRepository = createProgressRepository(initialProgress, async (record) => {
      savedRecords.push(record);

      if (savedRecords.length === 1) {
        completionSaveStarted.resolve();
        return completionSave.promise;
      }

      return record;
    });
    const advance = createAdvanceTutorialStepUseCase({
      tutorialRepository: createTutorialRepository(),
      progressRepository,
    });

    const resultPromise = advance({
      action: 'NEXT',
      runId: 'run-1',
      tutorialId: tutorialDefinition.id,
      targetLocated: true,
      destinationReady: true,
    });

    await completionSaveStarted.promise;

    expect(savedRecords).toEqual([
      {
        ...initialProgress,
        completedStepIds: ['step-1'],
      },
    ]);

    const persistedCompletion = savedRecords[0];
    if (persistedCompletion === undefined) {
      throw new Error('Expected completion persistence to start.');
    }
    completionSave.resolve(persistedCompletion);

    const result = await resultPromise;

    expect(savedRecords).toEqual([
      {
        ...initialProgress,
        completedStepIds: ['step-1'],
      },
      {
        ...initialProgress,
        currentStepId: 'step-2',
        completedStepIds: ['step-1'],
      },
    ]);
    expect(result).toEqual({
      ok: true,
      runId: 'run-1',
      transition: 'NEXT',
      progress: savedRecords[1],
    });
  });

  it('retains an incomplete Required Action step and identifies its failure', async () => {
    const initialProgress = progress({
      currentStepId: 'step-2',
      completedStepIds: ['step-1'],
    });
    const savedRecords: ProgressRecord[] = [];
    const progressRepository = createProgressRepository(initialProgress, async (record) => {
      savedRecords.push(record);
      return record;
    });
    const advance = createAdvanceTutorialStepUseCase({
      tutorialRepository: createTutorialRepository(),
      progressRepository,
    });

    const result = await advance({
      action: 'COMPLETE_ACTION',
      runId: 'run-1',
      tutorialId: tutorialDefinition.id,
      requiredActionSucceeded: false,
    });

    expect(result).toEqual({
      ok: false,
      runId: 'run-1',
      reason: 'REQUIRED_ACTION_FAILED',
      progress: initialProgress,
    });
    expect(result.progress.currentStepId).toBe('step-2');
    expect(result.progress.completedStepIds).not.toContain('step-2');
    expect(savedRecords).toEqual([]);
  });
});
