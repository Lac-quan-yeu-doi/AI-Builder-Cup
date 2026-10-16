import { describe, expect, it, vi } from 'vitest';

import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialFeatureAccessService } from '@/src/application/services/tutorial-feature-access.service.interface';
import type {
  ContextResource,
  WorkspaceContextService,
} from '@/src/application/services/workspace-context.service.interface';
import { createOpenTutorialDetailUseCase } from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type { TutorialDefinition } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

const definition: TutorialDefinition = {
  id: 'query-basics',
  metadata: {
    title: 'Query basics',
    summary: 'Learn to query authorized data.',
    category: 'Query',
    learningOutcomes: ['Run a query'],
    estimatedMinutes: 10,
    stepCount: 1,
  },
  steps: [
    {
      id: 'write-query',
      order: 1,
      title: 'Write a query',
      instructionalContent: 'Open the query editor.',
      destinationFeature: 'QUERY',
      destinationHref: '/query',
    },
  ],
  requiredFeatures: ['QUERY'],
  prerequisites: [{ id: 'connected-source', description: 'Connect a data source.' }],
  contextRequirements: [
    { id: 'database', resourceType: 'DATABASE', selectionCount: 1 },
    { id: 'pipeline', resourceType: 'PIPELINE', selectionCount: 1 },
  ],
};

function createRepository(): TutorialRepository {
  return {
    listAccessibleCatalog: vi.fn(async () => []),
    getDefinition: vi.fn(async () => definition),
    publish: vi.fn(async () => ({ ok: true as const })),
  };
}

function createFeatureAccessService(
  accessibleFeatures: readonly ('QUERY' | 'HOME')[] = ['QUERY'],
): TutorialFeatureAccessService {
  return {
    accessibleFeatures: vi.fn(async () => accessibleFeatures),
  };
}

function createContextService(
  resources: readonly ContextResource[],
  invalidResourceIds: readonly string[] = [],
): WorkspaceContextService {
  return {
    listAuthorizedResources: vi.fn(async () => resources),
    isResourceStillValid: vi.fn(
      async (_resourceType, resourceId) => !invalidResourceIds.includes(resourceId),
    ),
  };
}

describe('open tutorial detail', () => {
  it('presents informational prerequisites without requiring an external evaluation', async () => {
    const informationalDefinition: TutorialDefinition = {
      ...definition,
      prerequisites: [
        {
          id: 'postgresql-access',
          description: 'Access to a PostgreSQL database and its connection details.',
          informational: true,
        },
      ],
      contextRequirements: [],
    };
    const repository = createRepository();
    repository.getDefinition = vi.fn(async () => informationalDefinition);
    const openDetail = createOpenTutorialDetailUseCase(
      repository,
      createFeatureAccessService(),
      createContextService([]),
    );

    const result = await openDetail({
      tutorialId: informationalDefinition.id,
      prerequisiteEvaluations: [],
      contextSelections: [],
    });

    expect(result.prerequisiteStates).toEqual([
      {
        id: 'postgresql-access',
        description: 'Access to a PostgreSQL database and its connection details.',
        informational: true,
        satisfied: true,
        remediation: null,
      },
    ]);
    expect(result.startEnabled).toBe(true);
  });

  it('loads complete metadata, evaluates prerequisites, and builds authorized selectors', async () => {
    const repository = createRepository();
    const featureAccessService = createFeatureAccessService();
    const contextService = createContextService([
      { id: 'database-1', name: 'Orders', resourceType: 'DATABASE' },
      { id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' },
      { id: 'connection-1', name: 'Restricted type', resourceType: 'CONNECTION' },
    ]);
    const openDetail = createOpenTutorialDetailUseCase(
      repository,
      featureAccessService,
      contextService,
    );

    const result = await openDetail({
      tutorialId: definition.id,
      prerequisiteEvaluations: [{ id: 'connected-source', satisfied: true }],
      contextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'pipeline', resourceType: 'PIPELINE', resourceId: 'pipeline-1' },
      ],
    });

    expect(repository.getDefinition).toHaveBeenCalledWith('query-basics');
    expect(featureAccessService.accessibleFeatures).toHaveBeenCalledOnce();
    expect(contextService.listAuthorizedResources).toHaveBeenCalledTimes(2);
    expect(result.metadata).toEqual(definition.metadata);
    expect(result.prerequisiteStates).toEqual([
      {
        id: 'connected-source',
        description: 'Connect a data source.',
        satisfied: true,
        remediation: null,
      },
    ]);
    expect(result.contextSelectors).toEqual([
      {
        id: 'database:1',
        requirementId: 'database',
        resourceType: 'DATABASE',
        options: [{ id: 'database-1', name: 'Orders', resourceType: 'DATABASE' }],
        selectedResource: { id: 'database-1', name: 'Orders', resourceType: 'DATABASE' },
      },
      {
        id: 'pipeline:1',
        requirementId: 'pipeline',
        resourceType: 'PIPELINE',
        options: [{ id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' }],
        selectedResource: { id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' },
      },
    ]);
    expect(result.contextSelections).toEqual([
      {
        requirementId: 'database',
        resourceType: 'DATABASE',
        resourceId: 'database-1',
        resourceName: 'Orders',
      },
      {
        requirementId: 'pipeline',
        resourceType: 'PIPELINE',
        resourceId: 'pipeline-1',
        resourceName: 'Daily load',
      },
    ]);
    expect(result.replacementRequiredRequirementIds).toEqual([]);
    expect(result.startEnabled).toBe(true);
  });

  it('retains valid selections, clears only invalid selections, and reports every blocker', async () => {
    const contextService = createContextService(
      [
        { id: 'database-1', name: 'Orders', resourceType: 'DATABASE' },
        { id: 'pipeline-stale', name: 'Legacy load', resourceType: 'PIPELINE' },
      ],
      ['pipeline-stale'],
    );
    const openDetail = createOpenTutorialDetailUseCase(
      createRepository(),
      createFeatureAccessService([]),
      contextService,
    );

    const result = await openDetail({
      tutorialId: definition.id,
      prerequisiteEvaluations: [
        {
          id: 'connected-source',
          satisfied: false,
          remediation: { label: 'Connect source', href: '/connections' },
        },
      ],
      contextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'pipeline', resourceType: 'PIPELINE', resourceId: 'pipeline-stale' },
      ],
    });

    expect(result.prerequisiteStates).toEqual([
      {
        id: 'connected-source',
        description: 'Connect a data source.',
        satisfied: false,
        remediation: { label: 'Connect source', href: '/connections' },
      },
    ]);
    expect(result.contextSelections).toEqual([
      {
        requirementId: 'database',
        resourceType: 'DATABASE',
        resourceId: 'database-1',
        resourceName: 'Orders',
      },
    ]);
    expect(result.contextSelectors[0]?.selectedResource?.name).toBe('Orders');
    expect(result.contextSelectors[1]?.selectedResource).toBeNull();
    expect(result.replacementRequiredRequirementIds).toEqual(['pipeline']);
    expect(result.eligibility).toEqual({
      eligible: false,
      blockingFeatureIds: ['QUERY'],
      unsatisfiedPrerequisiteIds: ['connected-source'],
      unfilledContextRequirementIds: ['pipeline'],
    });
    expect(result.startEnabled).toBe(false);
  });

  it('restores saved paused context for resume and exposes a copied progress record', async () => {
    const savedProgress: ProgressRecord = {
      tutorialId: definition.id,
      memberId: 'member-1',
      organizationId: 'organization-1',
      status: 'PAUSED' as const,
      currentStepId: 'write-query',
      completedStepIds: [],
      contextSelections: [
        { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
        { requirementId: 'pipeline', resourceType: 'PIPELINE', resourceId: 'pipeline-1' },
      ],
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const progressRepository: Pick<TutorialProgressRepository, 'listForMember'> = {
      listForMember: vi.fn(async () => [savedProgress]),
    };
    const openDetail = createOpenTutorialDetailUseCase(
      createRepository(),
      createFeatureAccessService(),
      createContextService([
        { id: 'database-1', name: 'Orders', resourceType: 'DATABASE' },
        { id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' },
      ]),
      progressRepository,
    );

    const result = await openDetail({
      tutorialId: definition.id,
      prerequisiteEvaluations: [{ id: 'connected-source', satisfied: true }],
      contextSelections: [],
    });

    expect(result.startEnabled).toBe(true);
    expect(result.contextSelectors.map((selector) => selector.selectedResource?.id)).toEqual([
      'database-1',
      'pipeline-1',
    ]);
    expect(result.progress).toEqual(savedProgress);
    expect(result.progress).not.toBe(savedProgress);
    expect(result.progress?.contextSelections).not.toBe(savedProgress.contextSelections);
  });

  it('offers a new lifecycle action for eligible completed progress', async () => {
    const progressRepository: Pick<TutorialProgressRepository, 'listForMember'> = {
      listForMember: vi.fn(async () => [
        {
          tutorialId: definition.id,
          memberId: 'member-1',
          organizationId: 'organization-1',
          status: 'COMPLETED',
          currentStepId: 'write-query',
          completedStepIds: ['write-query'],
          contextSelections: [
            { requirementId: 'database', resourceType: 'DATABASE', resourceId: 'database-1' },
            { requirementId: 'pipeline', resourceType: 'PIPELINE', resourceId: 'pipeline-1' },
          ],
          updatedAt: '2026-09-21T00:00:00.000Z',
        } satisfies ProgressRecord,
      ]),
    };
    const openDetail = createOpenTutorialDetailUseCase(
      createRepository(),
      createFeatureAccessService(),
      createContextService([
        { id: 'database-1', name: 'Orders', resourceType: 'DATABASE' },
        { id: 'pipeline-1', name: 'Daily load', resourceType: 'PIPELINE' },
      ]),
      progressRepository,
    );

    const result = await openDetail({
      tutorialId: definition.id,
      prerequisiteEvaluations: [{ id: 'connected-source', satisfied: true }],
      contextSelections: [],
    });

    expect(result.startEnabled).toBe(true);
  });
});
