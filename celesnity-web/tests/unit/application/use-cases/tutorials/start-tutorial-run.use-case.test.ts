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
import type {
  CompletionRecord,
  ContextSelection,
  ProgressRecord,
} from '@/src/entities/models/tutorial-progress';

const startedAt = '2027-01-02T03:04:05.000Z';
const pausedAt = '2027-01-02T03:03:00.000Z';

function tutorialDefinition(): TutorialDefinition {
  return {
    id: 'tutorial-new',
    metadata: {
      title: 'Build a pipeline',
      summary: 'Create a first data pipeline.',
      category: 'Pipelines',
      learningOutcomes: ['Create a pipeline'],
      estimatedMinutes: 10,
      stepCount: 2,
    },
    steps: [
      {
        id: 'step-two',
        order: 2,
        title: 'Run it',
        instructionalContent: 'Run the pipeline.',
        destinationFeature: 'PIPELINES',
        destinationHref: '/pipelines/run',
      },
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

class RecordingTutorialRepository implements TutorialRepository {
  public readonly requestedIds: TutorialId[] = [];

  public constructor(
    private readonly definition: TutorialDefinition,
    private readonly calls: string[],
  ) {}

  public async listAccessibleCatalog(): Promise<readonly PublishedCatalogTutorial[]> {
    return [];
  }

  public async getDefinition(id: TutorialId): Promise<TutorialDefinition> {
    this.calls.push('getDefinition');
    this.requestedIds.push(id);
    return this.definition;
  }

  public async publish(): Promise<PublicationResult> {
    return { ok: true };
  }
}

class RecordingProgressRepository implements TutorialProgressRepository {
  public readonly saved: ProgressRecord[] = [];
  public saveFailure?: unknown;

  public constructor(
    public records: readonly ProgressRecord[],
    private readonly calls: string[],
  ) {}

  public async listForMember(): Promise<readonly ProgressRecord[]> {
    this.calls.push('listForMember');
    return this.records;
  }

  public async save(record: ProgressRecord): Promise<ProgressRecord> {
    this.calls.push(`save:${record.status}`);
    if (this.saveFailure !== undefined) {
      throw this.saveFailure;
    }
    this.saved.push(record);
    return record;
  }

  public async getOnboardingDecision(): Promise<OnboardingDecision | null> {
    return null;
  }

  public async saveOnboardingDecision(decision: OnboardingDecision): Promise<OnboardingDecision> {
    return decision;
  }

  public async saveCompletion(runId: string): Promise<CompletionRecord> {
    return { runId, completedAt: startedAt };
  }
}

function createFixture(
  records: readonly ProgressRecord[] = [],
  now: () => string = () => startedAt,
) {
  const calls: string[] = [];
  const tutorialRepository = new RecordingTutorialRepository(tutorialDefinition(), calls);
  const progressRepository = new RecordingProgressRepository(records, calls);
  const start = createStartTutorialRunUseCase({
    tutorialRepository,
    progressRepository,
    now,
  });

  return { calls, tutorialRepository, progressRepository, start };
}

const contextSelections: readonly ContextSelection[] = [
  {
    requirementId: 'database-context',
    resourceType: 'DATABASE',
    resourceId: 'database-1',
  },
];

const startInput = {
  tutorialId: 'tutorial-new',
  memberId: 'member-1',
  organizationId: 'organization-1',
  contextSelections,
} as const;

describe('start tutorial run use case', () => {
  it('persists exactly one IN_PROGRESS run at the first ordered step', async () => {
    const fixture = createFixture();

    const result = await fixture.start(startInput);

    expect(result).toEqual({
      outcome: 'STARTED',
      run: {
        tutorialId: 'tutorial-new',
        memberId: 'member-1',
        organizationId: 'organization-1',
        status: 'IN_PROGRESS',
        currentStepId: 'step-one',
        completedStepIds: [],
        contextSelections,
        updatedAt: startedAt,
      },
      destinationHref: '/pipelines/new',
    });
    expect(fixture.progressRepository.saved).toHaveLength(1);
    expect(fixture.progressRepository.saved[0]?.contextSelections).not.toBe(contextSelections);
    expect(fixture.tutorialRepository.requestedIds).toEqual(['tutorial-new']);
    expect(fixture.calls).toEqual(['listForMember', 'getDefinition', 'save:IN_PROGRESS']);
  });

  it('requests pause-or-cancel resolution without mutating an active run', async () => {
    const existingRun = activeRun();
    const fixture = createFixture([existingRun]);

    const result = await fixture.start(startInput);

    expect(result).toEqual({
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun: existingRun,
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    });
    expect(fixture.progressRepository.saved).toEqual([]);
    expect(fixture.tutorialRepository.requestedIds).toEqual([]);
    expect(fixture.calls).toEqual(['listForMember']);
  });

  it('cancels a conflicting start without changing the active run', async () => {
    const existingRun = activeRun();
    const fixture = createFixture([existingRun]);

    const result = await fixture.start({
      ...startInput,
      conflictResolution: 'CANCEL_NEW_START',
    });

    expect(result).toEqual({ outcome: 'CANCELLED', activeRun: existingRun });
    expect(fixture.progressRepository.saved).toEqual([]);
    expect(fixture.calls).toEqual(['listForMember']);
  });

  it('persists the active pause before creating the second run', async () => {
    const timestamps = [pausedAt, startedAt];
    let timestampIndex = 0;
    const fixture = createFixture([activeRun()], () => {
      const timestamp = timestamps[timestampIndex];
      if (timestamp === undefined) {
        throw new RangeError('Unexpected timestamp request.');
      }
      timestampIndex += 1;
      return timestamp;
    });

    const result = await fixture.start({
      ...startInput,
      conflictResolution: 'PAUSE_ACTIVE',
    });

    expect(result.outcome).toBe('STARTED');
    expect(fixture.progressRepository.saved).toHaveLength(2);
    expect(fixture.progressRepository.saved[0]).toEqual({
      ...activeRun(),
      status: 'PAUSED',
      updatedAt: pausedAt,
    });
    expect(fixture.progressRepository.saved[1]?.status).toBe('IN_PROGRESS');
    expect(fixture.calls).toEqual([
      'listForMember',
      'save:PAUSED',
      'getDefinition',
      'save:IN_PROGRESS',
    ]);
  });

  it('cancels the new start and retains the active run when pause persistence fails', async () => {
    const existingRun = activeRun();
    const fixture = createFixture([existingRun], () => pausedAt);
    const failure = new Error('pause unavailable');
    fixture.progressRepository.saveFailure = failure;

    const result = await fixture.start({
      ...startInput,
      conflictResolution: 'PAUSE_ACTIVE',
    });

    expect(result).toEqual({ outcome: 'PAUSE_FAILED', activeRun: existingRun, reason: failure });
    expect(fixture.progressRepository.saved).toEqual([]);
    expect(fixture.tutorialRepository.requestedIds).toEqual([]);
    expect(fixture.calls).toEqual(['listForMember', 'save:PAUSED']);
  });
});
