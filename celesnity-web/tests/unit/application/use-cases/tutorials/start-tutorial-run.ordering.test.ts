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

const pausedAt = '2027-01-02T03:03:00.000Z';
const startedAt = '2027-01-02T03:04:05.000Z';

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value | PromiseLike<Value>) => void;
}

function createDeferred<Value>(): Deferred<Value> {
  let resolve: Deferred<Value>['resolve'] = () => {
    throw new Error('Deferred promise was not initialized.');
  };
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function tutorialDefinition(): TutorialDefinition {
  return {
    id: 'tutorial-new',
    metadata: {
      title: 'Build a pipeline',
      summary: 'Create a first data pipeline.',
      category: 'Pipelines',
      learningOutcomes: ['Create a pipeline'],
      estimatedMinutes: 10,
      stepCount: 1,
    },
    steps: [
      {
        id: 'step-one',
        order: 1,
        title: 'Create it',
        instructionalContent: 'Create the pipeline.',
        destinationFeature: 'PIPELINES',
        destinationHref: '/pipelines/new',
      },
    ],
    requiredFeatures: ['PIPELINES'],
    prerequisites: [],
    contextRequirements: [],
  };
}

function activeRun(): ProgressRecord {
  return {
    tutorialId: 'tutorial-active',
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'IN_PROGRESS',
    currentStepId: 'active-step',
    completedStepIds: ['completed-step'],
    contextSelections: [],
    updatedAt: '2027-01-01T00:00:00.000Z',
  };
}

function createTutorialRepository(
  definition: TutorialDefinition,
  requestedIds: TutorialId[],
  events: string[],
): TutorialRepository {
  return {
    async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
      return [];
    },
    async getDefinition(id: TutorialId): Promise<TutorialDefinition> {
      events.push('definition-loaded');
      requestedIds.push(id);
      return definition;
    },
    async publish(): Promise<PublicationResult> {
      return { ok: true };
    },
  };
}

function createProgressRepository(
  existingRun: ProgressRecord,
  save: (record: ProgressRecord) => Promise<ProgressRecord>,
): TutorialProgressRepository {
  return {
    async listForMember(): Promise<readonly ProgressRecord[]> {
      return [existingRun];
    },
    save,
    async getOnboardingDecision(): Promise<OnboardingDecision | null> {
      return null;
    },
    async saveOnboardingDecision(decision: OnboardingDecision): Promise<OnboardingDecision> {
      return decision;
    },
    async saveCompletion(runId: string): Promise<CompletionRecord> {
      return { runId, completedAt: startedAt };
    },
  };
}

const startInput = {
  tutorialId: 'tutorial-new',
  memberId: 'member-1',
  organizationId: 'organization-1',
  contextSelections: [],
  conflictResolution: 'PAUSE_ACTIVE',
} as const;

describe('start tutorial run ordering and error paths', () => {
  // **Validates: Requirements 5.8**
  it('waits for pause persistence to complete before loading or saving the second run', async () => {
    const existingRun = activeRun();
    const pauseStarted = createDeferred<void>();
    const pauseCompleted = createDeferred<ProgressRecord>();
    const savedRecords: ProgressRecord[] = [];
    const requestedIds: TutorialId[] = [];
    const events: string[] = [];
    const progressRepository = createProgressRepository(existingRun, async (record) => {
      savedRecords.push(record);

      if (record.status === 'PAUSED') {
        events.push('pause-started');
        pauseStarted.resolve(undefined);
        const persistedPause = await pauseCompleted.promise;
        events.push('pause-completed');
        return persistedPause;
      }

      events.push('new-run-saved');
      return record;
    });
    const start = createStartTutorialRunUseCase({
      tutorialRepository: createTutorialRepository(tutorialDefinition(), requestedIds, events),
      progressRepository,
      now: (() => {
        const timestamps = [pausedAt, startedAt];
        return () => timestamps.shift() ?? startedAt;
      })(),
    });

    const resultPromise = start(startInput);
    await pauseStarted.promise;

    expect(events).toEqual(['pause-started']);
    expect(requestedIds).toEqual([]);
    expect(savedRecords).toEqual([
      {
        ...existingRun,
        status: 'PAUSED',
        updatedAt: pausedAt,
      },
    ]);

    pauseCompleted.resolve(savedRecords[0] ?? existingRun);
    const result = await resultPromise;

    expect(result.outcome).toBe('STARTED');
    expect(events).toEqual([
      'pause-started',
      'pause-completed',
      'definition-loaded',
      'new-run-saved',
    ]);
    expect(requestedIds).toEqual(['tutorial-new']);
    expect(savedRecords.map((record) => record.status)).toEqual(['PAUSED', 'IN_PROGRESS']);
  });

  // **Validates: Requirements 5.9**
  it('cancels the new start without loading its definition or saving it when pause fails', async () => {
    const existingRun = activeRun();
    const pauseFailure = new Error('pause persistence unavailable');
    const savedRecords: ProgressRecord[] = [];
    const requestedIds: TutorialId[] = [];
    const events: string[] = [];
    const progressRepository = createProgressRepository(existingRun, async (record) => {
      savedRecords.push(record);
      events.push(`save-${record.status}`);
      throw pauseFailure;
    });
    const start = createStartTutorialRunUseCase({
      tutorialRepository: createTutorialRepository(tutorialDefinition(), requestedIds, events),
      progressRepository,
      now: () => pausedAt,
    });

    const result = await start(startInput);

    expect(result).toEqual({
      outcome: 'PAUSE_FAILED',
      activeRun: existingRun,
      reason: pauseFailure,
    });
    expect(events).toEqual(['save-PAUSED']);
    expect(requestedIds).toEqual([]);
    expect(savedRecords).toEqual([
      {
        ...existingRun,
        status: 'PAUSED',
        updatedAt: pausedAt,
      },
    ]);
  });
});
