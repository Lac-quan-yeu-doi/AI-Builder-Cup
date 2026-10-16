import type { AuthenticatedContext } from '@application/administration/authenticated-context';
import type { TutorialContextReader } from '@application/tutorial/tutorial-context.reader';
import type {
  TutorialProgressRepository,
  TutorialRepository,
} from '@application/tutorial/tutorial.repository';
import { TutorialUseCases } from '@application/tutorial/tutorial.use-cases';
import type { TutorialDefinition, TutorialProgress } from '@domain/tutorial/models/tutorial';

const principal: AuthenticatedContext = {
  identityId: '20000000-0000-4000-8000-000000000001',
  subject: 'member-1',
  identityTenantId: 'tenant-1',
  organizationId: '10000000-0000-4000-8000-000000000001',
  organizationStatus: 'ACTIVE',
  mfaRequired: false,
  membershipId: '30000000-0000-4000-8000-000000000001',
  role: 'DATA_ENGINEER',
  authenticationTime: 0,
  mfaVerified: true,
  visibleFeatures: ['CATALOG_DATABASES', 'CATALOG_TABLES'],
};

const definition: TutorialDefinition = {
  id: 'tutorial-database',
  metadata: {
    title: 'Verify a database',
    summary: 'Verify an authorized source.',
    category: 'Getting started',
    learningOutcomes: ['Verify a source'],
    estimatedMinutes: 5,
    stepCount: 1,
  },
  steps: [
    {
      id: 'step-1',
      order: 1,
      title: 'Test the source',
      instructionalContent: 'Run the existing connection test.',
      destinationFeature: 'CATALOG_DATABASES',
      destinationHref: '/catalog/databases',
    },
  ],
  requiredFeatures: ['CATALOG_DATABASES'],
  prerequisites: [],
  contextRequirements: [
    { id: 'database-service', resourceType: 'DATABASE_SERVICE', selectionCount: 1 },
  ],
};

function buildUseCases(
  overrides: {
    readonly definitions?: readonly TutorialDefinition[];
    readonly resources?: readonly {
      readonly id: string;
      readonly name: string;
      readonly resourceType: string;
    }[];
    readonly progressRecords?: readonly TutorialProgress[];
  } = {},
) {
  const definitions = overrides.definitions ?? [definition];
  const tutorials: TutorialRepository = {
    list: jest.fn(async () => definitions),
    findById: jest.fn(async (id) => definitions.find((candidate) => candidate.id === id) ?? null),
    publish: jest.fn(async () => undefined),
  };
  const progress: TutorialProgressRepository = {
    list: jest.fn(async () => overrides.progressRecords ?? []),
    save: jest.fn(async (record) => record),
    getOnboardingDecision: jest.fn(async () => null),
    saveOnboardingDecision: jest.fn(async (organizationId, identityId, decision) => decision),
    saveCompletion: jest.fn(async (_organizationId, _identityId, runId) => ({
      runId,
      completedAt: '2026-09-21T00:00:00.000Z',
    })),
  };
  const contexts: TutorialContextReader = {
    listAuthorized: jest.fn(
      async () =>
        overrides.resources ?? [
          { id: 'service-1', name: 'Analytics', resourceType: 'DATABASE_SERVICE' },
        ],
    ),
  };
  return { useCases: new TutorialUseCases(tutorials, progress, contexts), tutorials, progress };
}

function progressInput(
  overrides: Partial<
    Omit<TutorialProgress, 'tutorialId' | 'memberId' | 'organizationId' | 'updatedAt'>
  > = {},
) {
  return {
    status: 'IN_PROGRESS' as const,
    currentStepId: 'step-1',
    completedStepIds: [],
    contextSelections: [
      {
        requirementId: 'database-service',
        resourceType: 'DATABASE_SERVICE',
        resourceId: 'service-1',
      },
    ],
    ...overrides,
  };
}

describe('TutorialUseCases', () => {
  it('lists only tutorials allowed by the current workspace features', async () => {
    const hidden = { ...definition, id: 'hidden', requiredFeatures: ['ADMINISTRATION'] as const };
    const { useCases } = buildUseCases({ definitions: [definition, hidden] });

    await expect(useCases.listAccessible(principal)).resolves.toEqual([definition]);
    await expect(useCases.getAccessible(principal, hidden.id)).rejects.toMatchObject({
      code: 'TUTORIAL_NOT_FOUND',
    });
  });

  it('derives tenant identity and update time instead of trusting request identity', async () => {
    const { useCases, progress } = buildUseCases();

    const saved = await useCases.saveProgress(principal, definition.id, progressInput());

    expect(saved).toMatchObject({
      tutorialId: definition.id,
      memberId: principal.identityId,
      organizationId: principal.organizationId,
      status: 'IN_PROGRESS',
    });
    expect(Date.parse(saved.updatedAt)).not.toBeNaN();
    expect(progress.save).toHaveBeenCalledWith(saved);
  });

  it('rejects missing, duplicate, or unauthorized context selections', async () => {
    const { useCases, progress } = buildUseCases();

    await expect(
      useCases.saveProgress(principal, definition.id, progressInput({ contextSelections: [] })),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });
    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({
          contextSelections: [
            ...progressInput().contextSelections,
            ...progressInput().contextSelections,
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });
    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({
          contextSelections: [
            {
              requirementId: 'database-service',
              resourceType: 'DATABASE_SERVICE',
              resourceId: 'service-not-authorized',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });

    expect(progress.save).not.toHaveBeenCalled();
  });

  it('rejects progress that references steps outside the published definition', async () => {
    const { useCases, progress } = buildUseCases();

    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({ currentStepId: 'unknown-step' }),
      ),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });
    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({ completedStepIds: ['unknown-step'] }),
      ),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });

    expect(progress.save).not.toHaveBeenCalled();
  });

  it('does not let a stale tab overwrite a paused recovery checkpoint', async () => {
    const twoStepDefinition: TutorialDefinition = {
      ...definition,
      metadata: { ...definition.metadata, stepCount: 2 },
      steps: [
        definition.steps[0]!,
        {
          ...definition.steps[0]!,
          id: 'step-2',
          order: 2,
          title: 'Save the source',
        },
      ],
    };
    const paused: TutorialProgress = {
      tutorialId: definition.id,
      memberId: principal.identityId,
      organizationId: principal.organizationId,
      status: 'PAUSED',
      currentStepId: 'step-1',
      completedStepIds: [],
      contextSelections: progressInput().contextSelections,
      updatedAt: '2026-09-21T14:58:23.000Z',
    };
    const { useCases, progress } = buildUseCases({
      definitions: [twoStepDefinition],
      progressRecords: [paused],
    });

    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({
          status: 'PAUSED',
          currentStepId: 'step-2',
          completedStepIds: ['step-1'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'TUTORIAL_INVALID' });
    expect(progress.save).not.toHaveBeenCalled();
  });

  it('allows an explicit fresh start to replace paused progress', async () => {
    const paused: TutorialProgress = {
      tutorialId: definition.id,
      memberId: principal.identityId,
      organizationId: principal.organizationId,
      status: 'PAUSED',
      currentStepId: 'step-1',
      completedStepIds: ['step-1'],
      contextSelections: progressInput().contextSelections,
      updatedAt: '2026-09-21T15:00:00.000Z',
    };
    const { useCases, progress } = buildUseCases({ progressRecords: [paused] });

    await expect(
      useCases.saveProgress(
        principal,
        definition.id,
        progressInput({ status: 'IN_PROGRESS', completedStepIds: [] }),
      ),
    ).resolves.toMatchObject({
      status: 'IN_PROGRESS',
      currentStepId: 'step-1',
      completedStepIds: [],
    });
    expect(progress.save).toHaveBeenCalledTimes(1);
  });

  it('validates publication before changing the catalog', async () => {
    const { useCases, tutorials } = buildUseCases();
    const invalid = {
      ...definition,
      metadata: { ...definition.metadata, stepCount: 2 },
    };

    await expect(useCases.publish(invalid)).resolves.toEqual({
      ok: false,
      violations: ['METADATA_STEP_COUNT_MISMATCH'],
    });
    expect(tutorials.publish).not.toHaveBeenCalled();
  });

  it('publishes a complete simulated Chat experience', async () => {
    const { useCases, tutorials } = buildUseCases();
    const simulated: TutorialDefinition = {
      ...definition,
      experience: {
        mode: 'SIMULATED_CHAT',
        scenarioId: 'agent-ask-data',
        scenarioVersion: 1,
        resumePolicy: 'RESTART',
      },
    };

    await expect(useCases.publish(simulated)).resolves.toEqual({ ok: true });
    expect(tutorials.publish).toHaveBeenCalledWith(simulated);
  });

  it('rejects an incomplete simulated Chat experience', async () => {
    const { useCases, tutorials } = buildUseCases();
    const invalid = {
      ...definition,
      experience: {
        mode: 'SIMULATED_CHAT',
        scenarioId: '',
        scenarioVersion: 2,
        resumePolicy: 'RESUME',
      },
    } as unknown as TutorialDefinition;

    await expect(useCases.publish(invalid)).resolves.toEqual({
      ok: false,
      violations: ['INVALID_EXPERIENCE'],
    });
    expect(tutorials.publish).not.toHaveBeenCalled();
  });
});
