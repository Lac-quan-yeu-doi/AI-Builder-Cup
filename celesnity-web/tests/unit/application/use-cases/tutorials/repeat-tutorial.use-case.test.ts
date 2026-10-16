import { describe, expect, it, vi } from 'vitest';

import { createRepeatTutorialUseCase } from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';

const repeatedAt = '2027-03-04T05:06:07.000Z';

function definition(): TutorialDefinition {
  return {
    id: 'tutorial-1',
    metadata: {
      title: 'Create a pipeline',
      summary: 'Build and run a pipeline.',
      category: 'Pipelines',
      learningOutcomes: ['Create a pipeline'],
      estimatedMinutes: 10,
      stepCount: 2,
    },
    steps: [
      {
        id: 'step-2',
        order: 2,
        title: 'Run the pipeline',
        instructionalContent: 'Run the pipeline.',
        destinationFeature: 'PIPELINES',
        destinationHref: '/pipelines/run',
      },
      {
        id: 'step-1',
        order: 1,
        title: 'Create the pipeline',
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

function completedProgress(): ProgressRecord {
  return {
    tutorialId: 'tutorial-1',
    memberId: 'member-1',
    organizationId: 'organization-1',
    status: 'COMPLETED',
    currentStepId: 'step-2',
    completedStepIds: ['step-1', 'step-2'],
    contextSelections: [
      {
        requirementId: 'pipeline-context',
        resourceType: 'PIPELINE',
        resourceId: 'pipeline-1',
      },
    ],
    updatedAt: '2027-03-01T00:00:00.000Z',
  };
}

function createFixture() {
  const priorCompletions: readonly CompletionRecord[] = [
    { runId: 'completed-run-1', completedAt: '2027-03-01T00:00:00.000Z' },
  ];
  const getDefinition = vi.fn(async () => definition());
  const save = vi.fn(async (record: ProgressRecord) => record);
  const saveCompletion = vi.fn();
  const progressRepository = { save, saveCompletion };
  const repeat = createRepeatTutorialUseCase({
    tutorialRepository: { getDefinition },
    progressRepository,
    now: () => repeatedAt,
  });

  return { getDefinition, priorCompletions, repeat, save, saveCompletion };
}

describe('repeat tutorial use case', () => {
  it('requests confirmation without changing the completed run', async () => {
    const fixture = createFixture();
    const completed = completedProgress();

    const result = await fixture.repeat({ progress: completed });

    expect(result).toEqual({
      outcome: 'CONFIRMATION_REQUIRED',
      progress: completed,
    });
    if (result.outcome !== 'CONFIRMATION_REQUIRED') {
      throw new Error('Expected repeat confirmation to be requested.');
    }
    expect(result.progress).toBe(completed);
    expect(fixture.getDefinition).not.toHaveBeenCalled();
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it('preserves the completed run when repeat confirmation is declined', async () => {
    const fixture = createFixture();
    const completed = completedProgress();

    const result = await fixture.repeat({ progress: completed, confirmed: false });

    expect(result).toEqual({ outcome: 'DECLINED', progress: completed });
    if (result.outcome !== 'DECLINED') {
      throw new Error('Expected repeat confirmation to be declined.');
    }
    expect(result.progress).toBe(completed);
    expect(fixture.getDefinition).not.toHaveBeenCalled();
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it('creates a fresh first-step run and leaves prior completion records untouched', async () => {
    const fixture = createFixture();
    const completed = completedProgress();

    const result = await fixture.repeat({ progress: completed, confirmed: true });

    expect(result).toEqual({
      outcome: 'REPEATED',
      run: {
        ...completed,
        status: 'IN_PROGRESS',
        currentStepId: 'step-1',
        completedStepIds: [],
        contextSelections: completed.contextSelections,
        updatedAt: repeatedAt,
      },
      destinationHref: '/pipelines/new',
    });
    expect(fixture.save).toHaveBeenCalledTimes(1);
    expect(fixture.saveCompletion).not.toHaveBeenCalled();
    expect(fixture.priorCompletions).toEqual([
      { runId: 'completed-run-1', completedAt: '2027-03-01T00:00:00.000Z' },
    ]);
    if (result.outcome !== 'REPEATED') {
      throw new Error('Expected repetition to succeed.');
    }
    expect(result.run.contextSelections).not.toBe(completed.contextSelections);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completedStepIds).toEqual(['step-1', 'step-2']);
  });

  it.each(['PAUSED', 'IN_PROGRESS'] as const)(
    'starts fresh from saved %s progress',
    async (status) => {
      const fixture = createFixture();
      const savedProgress: ProgressRecord = {
        ...completedProgress(),
        status,
        currentStepId: 'step-2',
        completedStepIds: ['step-1'],
      };

      const result = await fixture.repeat({ progress: savedProgress, confirmed: true });

      expect(result).toMatchObject({
        outcome: 'REPEATED',
        run: {
          status: 'IN_PROGRESS',
          currentStepId: 'step-1',
          completedStepIds: [],
        },
        destinationHref: '/pipelines/new',
      });
    },
  );
});
