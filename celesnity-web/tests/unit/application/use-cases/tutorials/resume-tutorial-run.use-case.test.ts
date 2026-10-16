import { describe, expect, it, vi } from 'vitest';

import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import { createResumeTutorialRunUseCase } from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import { TutorialAccessError } from '@/src/entities/errors/application-errors';
import type { PublishedCatalogTutorial } from '@/src/entities/models/tutorial-catalog';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

const resumedAt = '2027-02-03T04:05:06.000Z';

const definition: TutorialDefinition = {
  id: 'query-basics',
  metadata: {
    title: 'Query basics',
    summary: 'Learn to query authorized data.',
    category: 'Query',
    learningOutcomes: ['Run a query'],
    estimatedMinutes: 10,
    stepCount: 2,
  },
  steps: [
    {
      id: 'choose-source',
      order: 1,
      title: 'Choose a source',
      instructionalContent: 'Choose an authorized source.',
      destinationFeature: 'CONNECTIONS',
      destinationHref: '/connections',
    },
    {
      id: 'run-query',
      order: 2,
      title: 'Run a query',
      instructionalContent: 'Run the guided query.',
      destinationFeature: 'QUERY',
      destinationHref: '/query',
    },
  ],
  requiredFeatures: ['CONNECTIONS', 'QUERY'],
  prerequisites: [
    { id: 'connected-source', description: 'Connect a source.' },
    { id: 'query-role', description: 'Obtain query access.' },
  ],
  contextRequirements: [{ id: 'database', resourceType: 'DATABASE', selectionCount: 1 }],
};

const pausedProgress: ProgressRecord = {
  tutorialId: definition.id,
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'PAUSED',
  currentStepId: 'choose-source',
  completedStepIds: ['choose-source'],
  contextSelections: [
    { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
  ],
  updatedAt: '2027-02-02T00:00:00.000Z',
};

const catalogTutorial: PublishedCatalogTutorial = {
  id: definition.id,
  title: definition.metadata.title,
  summary: definition.metadata.summary,
  category: definition.metadata.category,
  learningOutcomes: definition.metadata.learningOutcomes,
  estimatedMinutes: definition.metadata.estimatedMinutes,
  stepCount: definition.metadata.stepCount,
};

const defaultAccessibleFeatures: readonly WorkspaceFeature[] = ['CONNECTIONS', 'QUERY'];

function createFixture(options?: {
  readonly accessibleCatalog?: readonly PublishedCatalogTutorial[];
  readonly accessibleFeatures?: readonly WorkspaceFeature[];
  readonly resources?: readonly ContextResource[];
  readonly invalidResourceIds?: readonly string[];
  readonly progressRecords?: readonly ProgressRecord[];
}) {
  const saved: ProgressRecord[] = [];
  const tutorialRepository: Pick<TutorialRepository, 'getDefinition' | 'listAccessibleCatalog'> = {
    listAccessibleCatalog: vi.fn(async () => options?.accessibleCatalog ?? [catalogTutorial]),
    getDefinition: vi.fn(async () => definition),
  };
  const progressRepository: Pick<TutorialProgressRepository, 'listForMember' | 'save'> = {
    listForMember: vi.fn(async () => options?.progressRecords ?? [pausedProgress]),
    save: vi.fn(async (record: ProgressRecord) => {
      saved.push(record);
      return record;
    }),
  };
  const featureAccessService: TutorialFeatureAccessService = {
    accessibleFeatures: vi.fn(
      async (): Promise<readonly WorkspaceFeature[]> =>
        options?.accessibleFeatures ?? defaultAccessibleFeatures,
    ),
  };
  const workspaceContextService: WorkspaceContextService = {
    listAuthorizedResources: vi.fn(
      async () =>
        options?.resources ?? [{ id: 'database-1', name: 'Orders', resourceType: 'DATABASE' }],
    ),
    isResourceStillValid: vi.fn(
      async (_resourceType, resourceId) =>
        !(options?.invalidResourceIds ?? []).includes(resourceId),
    ),
  };
  const resume = createResumeTutorialRunUseCase({
    tutorialRepository,
    progressRepository,
    featureAccessService,
    workspaceContextService,
  });

  return {
    featureAccessService,
    progressRepository,
    resume,
    saved,
    tutorialRepository,
    workspaceContextService,
  };
}

const satisfiedPrerequisites = [
  { id: 'connected-source', satisfied: true },
  { id: 'query-role', satisfied: true },
] as const;

const SUCCESSFUL_RESUME_TEST =
  'revalidates access, prerequisites, and context before resuming at the first incomplete step';
const COMPLETE_BLOCKERS_TEST =
  'retains PAUSED and reports every feature, prerequisite, context, and destination blocker';
const DESTINATION_BLOCKER_TEST =
  'retains PAUSED when validation succeeds but the resume destination is not ready';
const INACCESSIBLE_TUTORIAL_TEST =
  'reports inaccessible saved tutorials with a safe access error before loading details';

describe('resume tutorial run use case', () => {
  it('requests a choice instead of persisting into another active tutorial run', async () => {
    const activeRun: ProgressRecord = {
      ...pausedProgress,
      tutorialId: 'another-tutorial',
      status: 'IN_PROGRESS',
    };
    const fixture = createFixture({ progressRecords: [pausedProgress, activeRun] });

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [],
      destinationReady: true,
      resumedAt,
    });

    expect(result).toEqual({
      outcome: 'CONFLICT_REQUIRES_CHOICE',
      activeRun,
      choices: ['PAUSE_ACTIVE', 'CANCEL_NEW_START'],
    });
    expect(fixture.saved).toEqual([]);
  });

  it('pauses the conflicting run before resuming the selected tutorial', async () => {
    const activeRun: ProgressRecord = {
      ...pausedProgress,
      tutorialId: 'another-tutorial',
      status: 'IN_PROGRESS',
    };
    const fixture = createFixture({ progressRecords: [pausedProgress, activeRun] });

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [],
      destinationReady: true,
      resumedAt,
      conflictResolution: 'PAUSE_ACTIVE',
    });

    expect(result.outcome).toBe('RESUMED');
    expect(fixture.saved).toEqual([
      { ...activeRun, status: 'PAUSED', updatedAt: resumedAt },
      {
        ...pausedProgress,
        status: 'IN_PROGRESS',
        currentStepId: 'run-query',
        updatedAt: resumedAt,
      },
    ]);
  });

  it(SUCCESSFUL_RESUME_TEST, async () => {
    const fixture = createFixture();

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [],
      destinationReady: true,
      resumedAt,
    });

    expect(result).toEqual({
      outcome: 'RESUMED',
      progress: {
        ...pausedProgress,
        status: 'IN_PROGRESS',
        currentStepId: 'run-query',
        contextSelections: pausedProgress.contextSelections,
        updatedAt: resumedAt,
      },
      destinationHref: '/query',
    });
    expect(fixture.saved).toEqual([
      {
        ...pausedProgress,
        status: 'IN_PROGRESS',
        currentStepId: 'run-query',
        contextSelections: pausedProgress.contextSelections,
        updatedAt: resumedAt,
      },
    ]);
    expect(fixture.featureAccessService.accessibleFeatures).toHaveBeenCalledOnce();
    expect(fixture.workspaceContextService.listAuthorizedResources).toHaveBeenCalledWith(
      'DATABASE',
    );
    expect(fixture.workspaceContextService.isResourceStillValid).toHaveBeenCalledWith(
      'DATABASE',
      'database-1',
    );
    expect(pausedProgress.status).toBe('PAUSED');
  });

  it(COMPLETE_BLOCKERS_TEST, async () => {
    const fixture = createFixture({
      accessibleFeatures: [],
      resources: [],
    });

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: [
        { id: 'connected-source', satisfied: false },
        { id: 'query-role', satisfied: false },
      ],
      replacementContextSelections: [],
      destinationReady: false,
      resumedAt,
    });

    expect(result).toEqual({
      outcome: 'BLOCKED',
      progress: pausedProgress,
      destinationHref: '/query',
      blockers: {
        blockingFeatureIds: ['CONNECTIONS', 'QUERY'],
        unsatisfiedPrerequisiteIds: ['connected-source', 'query-role'],
        replacementRequiredRequirementIds: ['database'],
        destinationNotReady: true,
      },
    });
    if (result.outcome !== 'BLOCKED') throw new Error('Expected resume to be blocked.');
    expect(result.progress).toBe(pausedProgress);
    expect(fixture.saved).toEqual([]);
  });

  it('accepts an authorized replacement for invalid saved context before resuming', async () => {
    const fixture = createFixture({
      resources: [{ id: 'database-2', name: 'Current orders', resourceType: 'DATABASE' }],
    });

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-2' },
      ],
      destinationReady: true,
      resumedAt,
    });

    expect(result.outcome).toBe('RESUMED');
    if (result.outcome !== 'RESUMED') throw new Error('Expected resume to succeed.');
    expect(result.progress.contextSelections).toEqual([
      { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-2' },
    ]);
    expect(fixture.workspaceContextService.isResourceStillValid).toHaveBeenCalledWith(
      'DATABASE',
      'database-2',
    );
  });

  it(DESTINATION_BLOCKER_TEST, async () => {
    const fixture = createFixture();

    const result = await fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [],
      destinationReady: false,
      resumedAt,
    });

    expect(result).toEqual({
      outcome: 'BLOCKED',
      progress: pausedProgress,
      destinationHref: '/query',
      blockers: {
        blockingFeatureIds: [],
        unsatisfiedPrerequisiteIds: [],
        replacementRequiredRequirementIds: [],
        destinationNotReady: true,
      },
    });
    expect(fixture.saved).toEqual([]);
  });

  it(INACCESSIBLE_TUTORIAL_TEST, async () => {
    const fixture = createFixture({ accessibleCatalog: [] });

    const promise = fixture.resume({
      progress: pausedProgress,
      prerequisiteEvaluations: satisfiedPrerequisites,
      replacementContextSelections: [],
      destinationReady: true,
      resumedAt,
    });

    await expect(promise).rejects.toEqual(new TutorialAccessError());
    expect(fixture.tutorialRepository.getDefinition).not.toHaveBeenCalled();
    expect(fixture.featureAccessService.accessibleFeatures).not.toHaveBeenCalled();
    expect(fixture.saved).toEqual([]);

    const error = await promise.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(TutorialAccessError);
    expect(JSON.stringify(error)).not.toContain(pausedProgress.tutorialId);
  });

  it('rejects resume attempts for a completed run without invoking ports', async () => {
    const fixture = createFixture();

    await expect(
      fixture.resume({
        progress: { ...pausedProgress, status: 'COMPLETED' },
        prerequisiteEvaluations: satisfiedPrerequisites,
        replacementContextSelections: [],
        destinationReady: true,
        resumedAt,
      }),
    ).rejects.toThrow('Only a paused or in-progress tutorial run can be resumed.');

    expect(fixture.tutorialRepository.listAccessibleCatalog).not.toHaveBeenCalled();
    expect(fixture.saved).toEqual([]);
  });
});
