import type {
  CompletionRecord,
  ContextSelection,
  ProgressRecord,
  TutorialStatus,
} from '@/src/entities/models/tutorial-progress';
import type { WorkspaceFeature } from '@/src/entities/models/workspace-feature';

export interface TutorialContextSelectionViewModel {
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface TutorialProgressViewModel {
  readonly tutorialId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly status: TutorialStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly TutorialContextSelectionViewModel[];
  readonly updatedAt: string;
}

export interface TutorialCompletionRecordViewModel {
  readonly runId: string;
  readonly completedAt: string;
}

type StartConflictResolution = 'PAUSE_ACTIVE' | 'CANCEL_NEW_START';

type StartTutorialRunPresentationInput =
  | {
      readonly outcome: 'STARTED';
      readonly run: ProgressRecord;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: ProgressRecord;
      readonly choices: readonly StartConflictResolution[];
    }
  | {
      readonly outcome: 'CANCELLED' | 'PAUSE_FAILED';
      readonly activeRun: ProgressRecord;
    };

export type StartTutorialRunViewModel =
  | {
      readonly outcome: 'STARTED';
      readonly run: TutorialProgressViewModel;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: TutorialProgressViewModel;
      readonly choices: readonly StartConflictResolution[];
    }
  | {
      readonly outcome: 'CANCELLED' | 'PAUSE_FAILED';
      readonly activeRun: TutorialProgressViewModel;
    };

type AdvanceTutorialStepFailureReason =
  | 'ACTION_NOT_REQUIRED'
  | 'DESTINATION_NOT_READY'
  | 'FINAL_STEP'
  | 'FIRST_STEP'
  | 'REQUIRED_ACTION_FAILED'
  | 'REQUIRED_ACTION_INCOMPLETE'
  | 'TARGET_NOT_LOCATED';

type AdvanceTutorialStepPresentationInput =
  | {
      readonly ok: true;
      readonly runId: string;
      readonly transition: 'ACTION_COMPLETED' | 'NEXT' | 'PREVIOUS';
      readonly progress: ProgressRecord;
    }
  | {
      readonly ok: false;
      readonly runId: string;
      readonly reason: AdvanceTutorialStepFailureReason;
      readonly progress: ProgressRecord;
    };

export type AdvanceTutorialStepViewModel =
  | {
      readonly ok: true;
      readonly runId: string;
      readonly transition: 'ACTION_COMPLETED' | 'NEXT' | 'PREVIOUS';
      readonly progress: TutorialProgressViewModel;
    }
  | {
      readonly ok: false;
      readonly runId: string;
      readonly reason: AdvanceTutorialStepFailureReason;
      readonly progress: TutorialProgressViewModel;
    };

type PauseTutorialRunPresentationInput =
  | { readonly ok: true; readonly progress: ProgressRecord }
  | { readonly ok: false; readonly progress: ProgressRecord };

export type PauseTutorialRunViewModel =
  | { readonly ok: true; readonly progress: TutorialProgressViewModel }
  | { readonly ok: false; readonly progress: TutorialProgressViewModel };

interface ResumeTutorialRunBlockersPresentationInput {
  readonly blockingFeatureIds: readonly WorkspaceFeature[];
  readonly unsatisfiedPrerequisiteIds: readonly string[];
  readonly replacementRequiredRequirementIds: readonly string[];
  readonly destinationNotReady: boolean;
}

export interface ResumeTutorialRunBlockersViewModel {
  readonly blockingFeatureIds: readonly WorkspaceFeature[];
  readonly unsatisfiedPrerequisiteIds: readonly string[];
  readonly replacementRequiredRequirementIds: readonly string[];
  readonly destinationNotReady: boolean;
}

type ResumeTutorialRunPresentationInput =
  | {
      readonly outcome: 'RESUMED';
      readonly progress: ProgressRecord;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'BLOCKED';
      readonly progress: ProgressRecord;
      readonly destinationHref: string;
      readonly blockers: ResumeTutorialRunBlockersPresentationInput;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: ProgressRecord;
      readonly choices: readonly ['PAUSE_ACTIVE', 'CANCEL_NEW_START'];
    }
  | { readonly outcome: 'CANCELLED'; readonly activeRun: ProgressRecord }
  | { readonly outcome: 'PAUSE_FAILED'; readonly activeRun: ProgressRecord };

export type ResumeTutorialRunViewModel =
  | {
      readonly outcome: 'RESUMED';
      readonly progress: TutorialProgressViewModel;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'BLOCKED';
      readonly progress: TutorialProgressViewModel;
      readonly destinationHref: string;
      readonly blockers: ResumeTutorialRunBlockersViewModel;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: TutorialProgressViewModel;
      readonly choices: readonly ['PAUSE_ACTIVE', 'CANCEL_NEW_START'];
    }
  | { readonly outcome: 'CANCELLED'; readonly activeRun: TutorialProgressViewModel }
  | { readonly outcome: 'PAUSE_FAILED'; readonly activeRun: TutorialProgressViewModel };

type CompleteTutorialRunPresentationInput =
  | {
      readonly ok: true;
      readonly progress: ProgressRecord;
      readonly completion: CompletionRecord;
    }
  | {
      readonly ok: false;
      readonly progress: ProgressRecord;
    };

export type CompleteTutorialRunViewModel =
  | {
      readonly ok: true;
      readonly progress: TutorialProgressViewModel;
      readonly completion: TutorialCompletionRecordViewModel;
    }
  | {
      readonly ok: false;
      readonly progress: TutorialProgressViewModel;
    };

type RepeatTutorialPresentationInput =
  | {
      readonly outcome: 'CONFIRMATION_REQUIRED' | 'DECLINED';
      readonly progress: ProgressRecord;
    }
  | {
      readonly outcome: 'REPEATED';
      readonly run: ProgressRecord;
      readonly destinationHref: string;
    };

export type RepeatTutorialViewModel =
  | {
      readonly outcome: 'CONFIRMATION_REQUIRED' | 'DECLINED';
      readonly progress: TutorialProgressViewModel;
    }
  | {
      readonly outcome: 'REPEATED';
      readonly run: TutorialProgressViewModel;
      readonly destinationHref: string;
    };

function presentContextSelection(selection: ContextSelection): TutorialContextSelectionViewModel {
  return Object.freeze({
    requirementId: selection.requirementId,
    resourceType: selection.resourceType,
    resourceId: selection.resourceId,
  });
}

export function presentTutorialProgress(progress: ProgressRecord): TutorialProgressViewModel {
  return Object.freeze({
    tutorialId: progress.tutorialId,
    memberId: progress.memberId,
    organizationId: progress.organizationId,
    status: progress.status,
    currentStepId: progress.currentStepId,
    completedStepIds: Object.freeze([...progress.completedStepIds]),
    contextSelections: Object.freeze(progress.contextSelections.map(presentContextSelection)),
    updatedAt: progress.updatedAt,
  });
}

export function presentStartTutorialRun(
  result: StartTutorialRunPresentationInput,
): StartTutorialRunViewModel {
  switch (result.outcome) {
    case 'STARTED':
      return Object.freeze({
        outcome: result.outcome,
        run: presentTutorialProgress(result.run),
        destinationHref: result.destinationHref,
      });
    case 'CONFLICT_REQUIRES_CHOICE':
      return Object.freeze({
        outcome: result.outcome,
        activeRun: presentTutorialProgress(result.activeRun),
        choices: Object.freeze([...result.choices]),
      });
    case 'CANCELLED':
    case 'PAUSE_FAILED':
      return Object.freeze({
        outcome: result.outcome,
        activeRun: presentTutorialProgress(result.activeRun),
      });
  }
}

export function presentAdvanceTutorialStep(
  result: AdvanceTutorialStepPresentationInput,
): AdvanceTutorialStepViewModel {
  if (result.ok) {
    return Object.freeze({
      ok: true,
      runId: result.runId,
      transition: result.transition,
      progress: presentTutorialProgress(result.progress),
    });
  }

  return Object.freeze({
    ok: false,
    runId: result.runId,
    reason: result.reason,
    progress: presentTutorialProgress(result.progress),
  });
}

export function presentPauseTutorialRun(
  result: PauseTutorialRunPresentationInput,
): PauseTutorialRunViewModel {
  return Object.freeze({
    ok: result.ok,
    progress: presentTutorialProgress(result.progress),
  });
}

export function presentResumeTutorialRun(
  result: ResumeTutorialRunPresentationInput,
): ResumeTutorialRunViewModel {
  if (result.outcome === 'RESUMED') {
    return Object.freeze({
      outcome: result.outcome,
      progress: presentTutorialProgress(result.progress),
      destinationHref: result.destinationHref,
    });
  }

  if (
    result.outcome === 'CONFLICT_REQUIRES_CHOICE' ||
    result.outcome === 'CANCELLED' ||
    result.outcome === 'PAUSE_FAILED'
  ) {
    return Object.freeze({
      outcome: result.outcome,
      activeRun: presentTutorialProgress(result.activeRun),
      ...(result.outcome === 'CONFLICT_REQUIRES_CHOICE'
        ? { choices: Object.freeze([...result.choices]) }
        : {}),
    }) as ResumeTutorialRunViewModel;
  }

  return Object.freeze({
    outcome: result.outcome,
    progress: presentTutorialProgress(result.progress),
    destinationHref: result.destinationHref,
    blockers: Object.freeze({
      blockingFeatureIds: Object.freeze([...result.blockers.blockingFeatureIds]),
      unsatisfiedPrerequisiteIds: Object.freeze([...result.blockers.unsatisfiedPrerequisiteIds]),
      replacementRequiredRequirementIds: Object.freeze([
        ...result.blockers.replacementRequiredRequirementIds,
      ]),
      destinationNotReady: result.blockers.destinationNotReady,
    }),
  });
}

export function presentCompleteTutorialRun(
  result: CompleteTutorialRunPresentationInput,
): CompleteTutorialRunViewModel {
  if (!result.ok) {
    return Object.freeze({
      ok: false,
      progress: presentTutorialProgress(result.progress),
    });
  }

  return Object.freeze({
    ok: true,
    progress: presentTutorialProgress(result.progress),
    completion: Object.freeze({
      runId: result.completion.runId,
      completedAt: result.completion.completedAt,
    }),
  });
}

export function presentRepeatTutorial(
  result: RepeatTutorialPresentationInput,
): RepeatTutorialViewModel {
  if (result.outcome === 'REPEATED') {
    return Object.freeze({
      outcome: result.outcome,
      run: presentTutorialProgress(result.run),
      destinationHref: result.destinationHref,
    });
  }

  return Object.freeze({
    outcome: result.outcome,
    progress: presentTutorialProgress(result.progress),
  });
}
