import { describe, expect, it, vi } from 'vitest';

import type {
  AdvanceTutorialStepResult,
  AdvanceTutorialStepUseCase,
} from '@/src/application/use-cases/tutorials/advance-tutorial-step.use-case';
import type {
  CompleteTutorialRunResult,
  CompleteTutorialRunUseCase,
} from '@/src/application/use-cases/tutorials/complete-tutorial-run.use-case';
import type {
  ListedCatalogTutorial,
  ListTutorialCatalogUseCase,
} from '@/src/application/use-cases/tutorials/list-tutorial-catalog.use-case';
import type {
  OpenTutorialDetailResult,
  OpenTutorialDetailUseCase,
} from '@/src/application/use-cases/tutorials/open-tutorial-detail.use-case';
import type {
  PauseTutorialRunResult,
  PauseTutorialRunUseCase,
} from '@/src/application/use-cases/tutorials/pause-tutorial-run.use-case';
import type {
  RecordOnboardingDecisionResult,
  RecordOnboardingDecisionUseCase,
} from '@/src/application/use-cases/tutorials/record-onboarding-decision.use-case';
import type {
  RepeatTutorialResult,
  RepeatTutorialUseCase,
} from '@/src/application/use-cases/tutorials/repeat-tutorial.use-case';
import type {
  ResolveOnboardingResult,
  ResolveOnboardingUseCase,
} from '@/src/application/use-cases/tutorials/resolve-onboarding.use-case';
import type {
  ResumeTutorialRunResult,
  ResumeTutorialRunUseCase,
} from '@/src/application/use-cases/tutorials/resume-tutorial-run.use-case';
import type {
  StartTutorialRunResult,
  StartTutorialRunUseCase,
} from '@/src/application/use-cases/tutorials/start-tutorial-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { createAdvanceTutorialStepController } from '@/src/interface-adapters/controllers/tutorials/advance-tutorial-step.controller';
import { createCompleteTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/complete-tutorial-run.controller';
import { createListTutorialCatalogController } from '@/src/interface-adapters/controllers/tutorials/list-tutorial-catalog.controller';
import { createOpenTutorialDetailController } from '@/src/interface-adapters/controllers/tutorials/open-tutorial-detail.controller';
import { createPauseTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/pause-tutorial-run.controller';
import { createRecordOnboardingDecisionController } from '@/src/interface-adapters/controllers/tutorials/record-onboarding-decision.controller';
import { createRepeatTutorialController } from '@/src/interface-adapters/controllers/tutorials/repeat-tutorial.controller';
import { createResolveOnboardingController } from '@/src/interface-adapters/controllers/tutorials/resolve-onboarding.controller';
import { createResumeTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/resume-tutorial-run.controller';
import { createStartTutorialRunController } from '@/src/interface-adapters/controllers/tutorials/start-tutorial-run.controller';
import type {
  AdvanceTutorialStepInput,
  CompleteTutorialRunInput,
  ListTutorialCatalogInput,
  OpenTutorialDetailInput,
  PauseTutorialRunInput,
  RecordOnboardingDecisionInput,
  RepeatTutorialInput,
  ResumeTutorialRunInput,
  StartTutorialRunInput,
} from '@/src/interface-adapters/controllers/tutorials/tutorial.schemas';

const contextSelection = {
  requirementId: 'database-context',
  resourceType: 'DATABASE',
  resourceId: 'database-1',
} as const;

const inProgress: PauseTutorialRunInput['progress'] = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-1',
  completedStepIds: [],
  contextSelections: [contextSelection],
  updatedAt: '2026-04-01T10:00:00.000Z',
};

const paused: ResumeTutorialRunInput['progress'] = {
  ...inProgress,
  status: 'PAUSED',
};

const completed: RepeatTutorialInput['progress'] = {
  ...inProgress,
  status: 'COMPLETED',
  completedStepIds: ['step-1'],
};

const firstStep: TutorialStep = {
  id: 'step-1',
  order: 1,
  title: 'Create a database',
  instructionalContent: 'Open the database form.',
  destinationFeature: 'CATALOG_DATABASES',
  destinationHref: '/databases',
};

const catalogInput: ListTutorialCatalogInput = {
  searchTerm: 'database',
  statusFilters: ['IN_PROGRESS'],
};

const listedTutorial: ListedCatalogTutorial = {
  id: 'tutorial-1',
  title: 'Create a database',
  summary: 'Learn how to create a database.',
  category: 'Databases',
  learningOutcomes: ['Create a database safely'],
  estimatedMinutes: 5,
  stepCount: 1,
  status: 'IN_PROGRESS',
  progressPercentage: 50,
};

const detailInput: OpenTutorialDetailInput = {
  tutorialId: 'tutorial-1',
  prerequisiteEvaluations: [
    {
      id: 'has-connection',
      satisfied: false,
      remediation: { label: 'Create a connection', href: '/connections' },
    },
  ],
  contextSelections: [contextSelection],
};

const detailResult: OpenTutorialDetailResult = {
  tutorialId: 'tutorial-1',
  experience: { mode: 'WORKSPACE' },
  metadata: {
    title: 'Create a database',
    summary: 'Learn how to create a database.',
    category: 'Databases',
    learningOutcomes: ['Create a database safely'],
    estimatedMinutes: 5,
    stepCount: 1,
  },
  prerequisiteStates: [
    {
      id: 'has-connection',
      description: 'Create a connection first',
      informational: false,
      satisfied: false,
      remediation: { label: 'Create a connection', href: '/connections' },
    },
  ],
  contextSelectors: [
    {
      id: 'database-context:1',
      requirementId: 'database-context',
      resourceType: 'DATABASE',
      options: [{ id: 'database-1', name: 'Sales', resourceType: 'DATABASE' }],
      selectedResource: { id: 'database-1', name: 'Sales', resourceType: 'DATABASE' },
    },
  ],
  contextSelections: [{ ...contextSelection, resourceName: 'Sales' }],
  replacementRequiredRequirementIds: [],
  eligibility: {
    eligible: false,
    blockingFeatureIds: [],
    unsatisfiedPrerequisiteIds: ['has-connection'],
    unfilledContextRequirementIds: [],
  },
  startEnabled: false,
};

const startInput: StartTutorialRunInput = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  contextSelections: [contextSelection],
};

const advanceInput: AdvanceTutorialStepInput = {
  runId: 'run-1',
  tutorialId: 'tutorial-1',
  action: 'NEXT',
  targetLocated: true,
  destinationReady: true,
};

const pauseInput: PauseTutorialRunInput = {
  progress: inProgress,
  steps: [firstStep],
  pausedAt: '2026-04-01T10:01:00.000Z',
  trigger: 'USER_REQUEST',
};

const resumeInput: ResumeTutorialRunInput = {
  progress: paused,
  prerequisiteEvaluations: [{ id: 'has-connection', satisfied: true }],
  replacementContextSelections: [],
  destinationReady: false,
  resumedAt: '2026-04-01T10:02:00.000Z',
};

const completeInput: CompleteTutorialRunInput = {
  runId: 'run-1',
  progress: inProgress,
};

const repeatInput: RepeatTutorialInput = {
  progress: completed,
  confirmed: true,
};

const expectedProgressViewModel = {
  tutorialId: 'tutorial-1',
  memberId: 'member-1',
  organizationId: 'organization-1',
  status: 'IN_PROGRESS',
  currentStepId: 'step-1',
  completedStepIds: [],
  contextSelections: [contextSelection],
  updatedAt: '2026-04-01T10:00:00.000Z',
} as const;

function withUnknownKey<T extends object>(input: T): T & { readonly unexpected: true } {
  return { ...input, unexpected: true };
}

describe('list tutorial catalog controller', () => {
  it('validates, calls the use case exactly once, and presents the catalog ViewModel', async () => {
    const useCase: ListTutorialCatalogUseCase = vi.fn(async () => [listedTutorial]);
    const controller = createListTutorialCatalogController(useCase);

    const result = await controller(catalogInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(catalogInput);
    expect(result).toEqual({
      tutorials: [
        {
          id: 'tutorial-1',
          title: 'Create a database',
          summary: 'Learn how to create a database.',
          category: 'Databases',
          learningOutcomes: ['Create a database safely'],
          estimatedMinutes: 5,
          stepCount: 1,
          status: 'IN_PROGRESS',
          progressPercentage: 50,
        },
      ],
      noResults: false,
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: ListTutorialCatalogUseCase = vi.fn(async () => []);
    const controller = createListTutorialCatalogController(useCase);

    await expect(controller(withUnknownKey(catalogInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('open tutorial detail controller', () => {
  it('validates, calls the use case exactly once, and presents the detail ViewModel', async () => {
    const useCase: OpenTutorialDetailUseCase = vi.fn(async () => detailResult);
    const controller = createOpenTutorialDetailController(useCase);

    const result = await controller(detailInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(detailInput);
    expect(result).toEqual({
      tutorialId: 'tutorial-1',
      experience: { mode: 'WORKSPACE' },
      metadata: {
        title: 'Create a database',
        summary: 'Learn how to create a database.',
        category: 'Databases',
        learningOutcomes: ['Create a database safely'],
        estimatedMinutes: 5,
        stepCount: 1,
      },
      prerequisiteStates: [
        {
          id: 'has-connection',
          description: 'Create a connection first',
          satisfied: false,
          remediation: { label: 'Create a connection', href: '/connections' },
        },
      ],
      contextSelectors: [
        {
          id: 'database-context:1',
          requirementId: 'database-context',
          resourceType: 'DATABASE',
          options: [{ id: 'database-1', name: 'Sales' }],
          selectedResourceId: 'database-1',
          selectedResourceName: 'Sales',
        },
      ],
      startEnabled: false,
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: OpenTutorialDetailUseCase = vi.fn(async () => detailResult);
    const controller = createOpenTutorialDetailController(useCase);

    await expect(controller(withUnknownKey(detailInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('resolve onboarding controller', () => {
  it('calls the no-input use case exactly once and presents the recommendation ViewModel', async () => {
    const useCaseResult: ResolveOnboardingResult = {
      outcome: 'RECOMMENDATION_AVAILABLE',
      invitationVisible: true,
      recommendation: listedTutorial,
    };
    const useCase: ResolveOnboardingUseCase = vi.fn(async () => useCaseResult);
    const controller = createResolveOnboardingController(useCase);

    const result = await controller();

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith();
    expect(result).toEqual({
      outcome: 'RECOMMENDATION_AVAILABLE',
      invitationVisible: true,
      recommendation: {
        id: 'tutorial-1',
        title: 'Create a database',
        summary: 'Learn how to create a database.',
        category: 'Databases',
        learningOutcomes: ['Create a database safely'],
        estimatedMinutes: 5,
        stepCount: 1,
      },
    });
  });
});

describe('record onboarding decision controller', () => {
  const input: RecordOnboardingDecisionInput = {
    decision: 'accepted',
    tutorialId: 'tutorial-1',
  };
  const useCaseResult: RecordOnboardingDecisionResult = {
    outcome: 'OPEN_TUTORIAL_DETAIL',
    invitationVisible: false,
    tutorialId: 'tutorial-1',
  };

  it('validates, calls the use case exactly once, and presents the decision ViewModel', async () => {
    const useCase: RecordOnboardingDecisionUseCase = vi.fn(async () => useCaseResult);
    const controller = createRecordOnboardingDecisionController(useCase);

    const result = await controller(input);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(input);
    expect(result).toEqual(useCaseResult);
  });

  it('rejects unknown discriminated-union fields without calling the use case', async () => {
    const useCase: RecordOnboardingDecisionUseCase = vi.fn(async () => useCaseResult);
    const controller = createRecordOnboardingDecisionController(useCase);

    await expect(controller(withUnknownKey(input) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('start tutorial run controller', () => {
  const useCaseResult: StartTutorialRunResult = {
    outcome: 'STARTED',
    run: inProgress,
    destinationHref: '/databases',
  };

  it('validates, calls the use case exactly once, and presents the started run ViewModel', async () => {
    const useCase: StartTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createStartTutorialRunController(useCase);

    const result = await controller(startInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(startInput);
    expect(result).toEqual({
      outcome: 'STARTED',
      run: expectedProgressViewModel,
      destinationHref: '/databases',
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: StartTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createStartTutorialRunController(useCase);

    await expect(controller(withUnknownKey(startInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('advance tutorial step controller', () => {
  const useCaseResult: AdvanceTutorialStepResult = {
    ok: true,
    runId: 'run-1',
    transition: 'NEXT',
    progress: inProgress,
  };

  it('validates, calls the use case exactly once, and presents the transition ViewModel', async () => {
    const useCase: AdvanceTutorialStepUseCase = vi.fn(async () => useCaseResult);
    const controller = createAdvanceTutorialStepController(useCase);

    const result = await controller(advanceInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(advanceInput);
    expect(result).toEqual({
      ok: true,
      runId: 'run-1',
      transition: 'NEXT',
      progress: expectedProgressViewModel,
    });
  });

  it('rejects unknown discriminated-union fields without calling the use case', async () => {
    const useCase: AdvanceTutorialStepUseCase = vi.fn(async () => useCaseResult);
    const controller = createAdvanceTutorialStepController(useCase);

    await expect(controller(withUnknownKey(advanceInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('pause tutorial run controller', () => {
  const persistedPause: ProgressRecord = {
    ...paused,
    updatedAt: pauseInput.pausedAt,
  };
  const useCaseResult: PauseTutorialRunResult = {
    ok: true,
    progress: persistedPause,
  };

  it('validates, calls the use case exactly once, and presents the paused run ViewModel', async () => {
    const useCase: PauseTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createPauseTutorialRunController(useCase);

    const result = await controller(pauseInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(pauseInput);
    expect(result).toEqual({
      ok: true,
      progress: {
        ...expectedProgressViewModel,
        status: 'PAUSED',
        updatedAt: '2026-04-01T10:01:00.000Z',
      },
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: PauseTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createPauseTutorialRunController(useCase);

    await expect(controller(withUnknownKey(pauseInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('resume tutorial run controller', () => {
  const useCaseResult: ResumeTutorialRunResult = {
    outcome: 'BLOCKED',
    progress: paused,
    destinationHref: '/databases',
    blockers: {
      blockingFeatureIds: ['CATALOG_DATABASES'],
      unsatisfiedPrerequisiteIds: ['has-connection'],
      replacementRequiredRequirementIds: ['database-context'],
      destinationNotReady: true,
    },
  };

  it('validates, calls the use case exactly once, and presents the blocked resume ViewModel', async () => {
    const useCase: ResumeTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createResumeTutorialRunController(useCase);

    const result = await controller(resumeInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(resumeInput);
    expect(result).toEqual({
      outcome: 'BLOCKED',
      progress: { ...expectedProgressViewModel, status: 'PAUSED' },
      destinationHref: '/databases',
      blockers: {
        blockingFeatureIds: ['CATALOG_DATABASES'],
        unsatisfiedPrerequisiteIds: ['has-connection'],
        replacementRequiredRequirementIds: ['database-context'],
        destinationNotReady: true,
      },
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: ResumeTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createResumeTutorialRunController(useCase);

    await expect(controller(withUnknownKey(resumeInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('complete tutorial run controller', () => {
  const completedProgress: ProgressRecord = {
    ...completed,
    updatedAt: '2026-04-01T10:03:00.000Z',
  };
  const useCaseResult: CompleteTutorialRunResult = {
    ok: true,
    progress: completedProgress,
    completion: { runId: 'run-1', completedAt: '2026-04-01T10:03:00.000Z' },
  };

  it('validates, calls the use case exactly once, and presents the completion ViewModel', async () => {
    const useCase: CompleteTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createCompleteTutorialRunController(useCase);

    const result = await controller(completeInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(completeInput);
    expect(result).toEqual({
      ok: true,
      progress: {
        ...expectedProgressViewModel,
        status: 'COMPLETED',
        completedStepIds: ['step-1'],
        updatedAt: '2026-04-01T10:03:00.000Z',
      },
      completion: { runId: 'run-1', completedAt: '2026-04-01T10:03:00.000Z' },
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: CompleteTutorialRunUseCase = vi.fn(async () => useCaseResult);
    const controller = createCompleteTutorialRunController(useCase);

    await expect(controller(withUnknownKey(completeInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe('repeat tutorial controller', () => {
  const repeatedProgress: ProgressRecord = {
    ...inProgress,
    updatedAt: '2026-04-01T10:04:00.000Z',
  };
  const useCaseResult: RepeatTutorialResult = {
    outcome: 'REPEATED',
    run: repeatedProgress,
    destinationHref: '/databases',
  };

  it('validates, calls the use case exactly once, and presents the repeated run ViewModel', async () => {
    const useCase: RepeatTutorialUseCase = vi.fn(async () => useCaseResult);
    const controller = createRepeatTutorialController(useCase);

    const result = await controller(repeatInput);

    expect(useCase).toHaveBeenCalledOnce();
    expect(useCase).toHaveBeenCalledWith(repeatInput);
    expect(result).toEqual({
      outcome: 'REPEATED',
      run: {
        ...expectedProgressViewModel,
        updatedAt: '2026-04-01T10:04:00.000Z',
      },
      destinationHref: '/databases',
    });
  });

  it('rejects unknown boundary fields without calling the use case', async () => {
    const useCase: RepeatTutorialUseCase = vi.fn(async () => useCaseResult);
    const controller = createRepeatTutorialController(useCase);

    await expect(controller(withUnknownKey(repeatInput) as never)).rejects.toBeInstanceOf(
      InputParseError,
    );
    expect(useCase).not.toHaveBeenCalled();
  });
});
