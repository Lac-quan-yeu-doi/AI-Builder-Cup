import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import { NotFoundError } from '@/src/entities/errors/application-errors';
import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import { markStepComplete, type ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { canAdvanceNext } from '@/src/entities/models/tutorial-run';

interface AdvanceTutorialStepDependencies {
  readonly tutorialRepository: TutorialRepository;
  readonly progressRepository: TutorialProgressRepository;
}

interface AdvanceTutorialStepBaseInput {
  readonly runId: string;
  readonly tutorialId: string;
}

export type AdvanceTutorialStepInput =
  | (AdvanceTutorialStepBaseInput & {
      readonly action: 'NEXT';
      readonly targetLocated: boolean;
      readonly destinationReady: boolean;
    })
  | (AdvanceTutorialStepBaseInput & {
      readonly action: 'PREVIOUS';
      readonly destinationReady: boolean;
    })
  | (AdvanceTutorialStepBaseInput & {
      readonly action: 'COMPLETE_ACTION';
      readonly requiredActionSucceeded: boolean;
    });

export type AdvanceTutorialStepFailureReason =
  | 'ACTION_NOT_REQUIRED'
  | 'DESTINATION_NOT_READY'
  | 'FINAL_STEP'
  | 'FIRST_STEP'
  | 'REQUIRED_ACTION_FAILED'
  | 'REQUIRED_ACTION_INCOMPLETE'
  | 'TARGET_NOT_LOCATED';

export type AdvanceTutorialStepResult =
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

export type AdvanceTutorialStepUseCase = ReturnType<typeof createAdvanceTutorialStepUseCase>;

function blocked(
  runId: string,
  progress: ProgressRecord,
  reason: AdvanceTutorialStepFailureReason,
): AdvanceTutorialStepResult {
  return { ok: false, runId, reason, progress };
}

function orderedSteps(steps: readonly TutorialStep[]): readonly TutorialStep[] {
  return [...steps].sort((left, right) => left.order - right.order);
}

function forwardBlocker(
  step: TutorialStep,
  progress: ProgressRecord,
  targetLocated: boolean,
  destinationReady: boolean,
): AdvanceTutorialStepFailureReason {
  if (step.targetControl !== undefined && !targetLocated) {
    return 'TARGET_NOT_LOCATED';
  }

  if (step.requiredAction !== undefined && !progress.completedStepIds.includes(step.id)) {
    return 'REQUIRED_ACTION_INCOMPLETE';
  }

  return destinationReady ? 'FINAL_STEP' : 'DESTINATION_NOT_READY';
}

/**
 * Advances one active tutorial run while keeping persistence ordering in the
 * application layer. Runtime DOM readiness is supplied by the caller; this use
 * case owns completion and current-step persistence.
 */
export const createAdvanceTutorialStepUseCase =
  ({ tutorialRepository, progressRepository }: AdvanceTutorialStepDependencies) =>
  async (input: AdvanceTutorialStepInput): Promise<AdvanceTutorialStepResult> => {
    const records = await progressRepository.listForMember();
    const progress = records.find((record) => record.tutorialId === input.tutorialId);

    if (progress === undefined) {
      throw new NotFoundError('Tutorial progress is unavailable.');
    }

    const definition = await tutorialRepository.getDefinition(input.tutorialId);
    const steps = orderedSteps(definition.steps);
    const currentIndex = steps.findIndex((step) => step.id === progress.currentStepId);
    const currentStep = steps[currentIndex];

    if (currentStep === undefined) {
      throw new NotFoundError('The current tutorial step is unavailable.');
    }

    if (input.action === 'COMPLETE_ACTION') {
      if (currentStep.requiredAction === undefined) {
        return blocked(input.runId, progress, 'ACTION_NOT_REQUIRED');
      }

      if (!input.requiredActionSucceeded) {
        return blocked(input.runId, progress, 'REQUIRED_ACTION_FAILED');
      }

      const completed = markStepComplete(progress, currentStep.id);
      const persisted =
        completed === progress ? progress : await progressRepository.save(completed);

      return {
        ok: true,
        runId: input.runId,
        transition: 'ACTION_COMPLETED',
        progress: persisted,
      };
    }

    if (input.action === 'PREVIOUS') {
      if (!input.destinationReady) {
        return blocked(input.runId, progress, 'DESTINATION_NOT_READY');
      }

      const previousStep = steps[currentIndex - 1];
      if (previousStep === undefined) {
        return blocked(input.runId, progress, 'FIRST_STEP');
      }

      const persisted = await progressRepository.save({
        ...progress,
        currentStepId: previousStep.id,
      });

      return {
        ok: true,
        runId: input.runId,
        transition: 'PREVIOUS',
        progress: persisted,
      };
    }

    if (
      !canAdvanceNext(currentStep, progress, {
        targetLocated: input.targetLocated,
        destinationTransitionComplete: input.destinationReady,
      })
    ) {
      return blocked(
        input.runId,
        progress,
        forwardBlocker(currentStep, progress, input.targetLocated, input.destinationReady),
      );
    }

    const nextStep = steps[currentIndex + 1];
    if (nextStep === undefined) {
      return blocked(input.runId, progress, 'FINAL_STEP');
    }

    // Completion must be durable before the visible current step can change.
    const completed = markStepComplete(progress, currentStep.id);
    const persistedCompletion = await progressRepository.save(completed);
    const persistedAdvance = await progressRepository.save({
      ...persistedCompletion,
      currentStepId: nextStep.id,
    });

    return {
      ok: true,
      runId: input.runId,
      transition: 'NEXT',
      progress: persistedAdvance,
    };
  };
