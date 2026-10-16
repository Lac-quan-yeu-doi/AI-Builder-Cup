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
    targetControl: {
      id: 'run-query-button',
      accessibleName: 'Run query',
      selector: '[data-tutorial-target="run-query"]',
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

function definition(): TutorialDefinition {
  return {
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
}

function progress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    tutorialId: 'tutorial-1',
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

function createDependencies(initialProgress: ProgressRecord) {
  const savedRecords: ProgressRecord[] = [];

  const tutorialRepository: TutorialRepository = {
    async listAccessibleCatalog() {
      return [];
    },
    async getDefinition() {
      return definition();
    },
    async publish() {
      return { ok: true };
    },
  };

  const progressRepository: TutorialProgressRepository = {
    async listForMember() {
      return [initialProgress];
    },
    async save(record) {
      savedRecords.push(record);
      return record;
    },
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

  return { tutorialRepository, progressRepository, savedRecords };
}

describe('advance tutorial step use case', () => {
  it('persists completion before advancing and preserves the run identity', async () => {
    const initialProgress = progress();
    const dependencies = createDependencies(initialProgress);
    const advance = createAdvanceTutorialStepUseCase(dependencies);

    const result = await advance({
      action: 'NEXT',
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      targetLocated: true,
      destinationReady: true,
    });

    expect(result).toEqual({
      ok: true,
      runId: 'run-1',
      transition: 'NEXT',
      progress: {
        ...initialProgress,
        currentStepId: 'step-2',
        completedStepIds: ['step-1'],
      },
    });
    expect(dependencies.savedRecords).toEqual([
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
    expect(initialProgress).toEqual(progress());
  });

  it.each([
    {
      name: 'target control is not located',
      targetLocated: false,
      destinationReady: true,
      reason: 'TARGET_NOT_LOCATED' as const,
    },
    {
      name: 'destination is not ready',
      targetLocated: true,
      destinationReady: false,
      reason: 'DESTINATION_NOT_READY' as const,
    },
  ])('retains the current state when the $name', async (scenario) => {
    const initialProgress = progress({
      currentStepId: 'step-2',
      completedStepIds: ['step-1', 'step-2'],
    });
    const dependencies = createDependencies(initialProgress);
    const advance = createAdvanceTutorialStepUseCase(dependencies);

    const result = await advance({
      action: 'NEXT',
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      targetLocated: scenario.targetLocated,
      destinationReady: scenario.destinationReady,
    });

    expect(result).toEqual({
      ok: false,
      runId: 'run-1',
      reason: scenario.reason,
      progress: initialProgress,
    });
    expect(dependencies.savedRecords).toEqual([]);
  });

  it('moves to the preceding step without clearing completed steps', async () => {
    const initialProgress = progress({
      currentStepId: 'step-2',
      completedStepIds: ['step-1', 'step-2'],
    });
    const dependencies = createDependencies(initialProgress);
    const advance = createAdvanceTutorialStepUseCase(dependencies);

    const result = await advance({
      action: 'PREVIOUS',
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      destinationReady: true,
    });

    expect(result).toEqual({
      ok: true,
      runId: 'run-1',
      transition: 'PREVIOUS',
      progress: {
        ...initialProgress,
        currentStepId: 'step-1',
      },
    });
    expect(dependencies.savedRecords).toEqual([
      {
        ...initialProgress,
        currentStepId: 'step-1',
      },
    ]);
  });

  it('identifies a required-action failure without completing or moving the step', async () => {
    const initialProgress = progress({
      currentStepId: 'step-2',
      completedStepIds: ['step-1'],
    });
    const dependencies = createDependencies(initialProgress);
    const advance = createAdvanceTutorialStepUseCase(dependencies);

    const failed = await advance({
      action: 'COMPLETE_ACTION',
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      requiredActionSucceeded: false,
    });

    expect(failed).toEqual({
      ok: false,
      runId: 'run-1',
      reason: 'REQUIRED_ACTION_FAILED',
      progress: initialProgress,
    });
    expect(dependencies.savedRecords).toEqual([]);
  });

  it('persists a successful required action once without advancing the step', async () => {
    const initialProgress = progress({
      currentStepId: 'step-2',
      completedStepIds: ['step-1'],
    });
    const dependencies = createDependencies(initialProgress);
    const advance = createAdvanceTutorialStepUseCase(dependencies);

    const result = await advance({
      action: 'COMPLETE_ACTION',
      runId: 'run-1',
      tutorialId: 'tutorial-1',
      requiredActionSucceeded: true,
    });

    expect(result).toEqual({
      ok: true,
      runId: 'run-1',
      transition: 'ACTION_COMPLETED',
      progress: {
        ...initialProgress,
        completedStepIds: ['step-1', 'step-2'],
      },
    });
    expect(dependencies.savedRecords).toEqual([
      {
        ...initialProgress,
        completedStepIds: ['step-1', 'step-2'],
      },
    ]);
  });
});
