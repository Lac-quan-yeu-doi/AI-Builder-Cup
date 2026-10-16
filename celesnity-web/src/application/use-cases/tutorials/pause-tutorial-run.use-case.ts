import type { IdentitySessionRepository } from '@/src/application/repositories/identity-session.repository.interface';
import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import { resumePoint, type ProgressRecord } from '@/src/entities/models/tutorial-progress';

export type PauseTutorialRunTrigger = 'USER_REQUEST' | 'PANEL_CLOSE' | 'SIGN_OUT' | 'ACCESS_LOSS';

export interface PauseTutorialRunInput {
  readonly progress: ProgressRecord;
  readonly steps: readonly TutorialStep[];
  readonly pausedAt: string;
  readonly trigger: PauseTutorialRunTrigger;
}

export type PauseTutorialRunResult =
  | {
      readonly ok: true;
      readonly progress: ProgressRecord;
    }
  | {
      readonly ok: false;
      /** The unchanged visible run state retained after persistence failure. */
      readonly progress: ProgressRecord;
      readonly error: unknown;
    };

export interface PauseTutorialRunDependencies {
  readonly progressRepository: Pick<TutorialProgressRepository, 'save'>;
  readonly identitySessionRepository: Pick<IdentitySessionRepository, 'signOut'>;
}

export type PauseTutorialRunUseCase = ReturnType<typeof createPauseTutorialRunUseCase>;

/**
 * Persists a run's Resume Point and PAUSED status before reporting success.
 * Access loss first checkpoints the current progress, and sign-out only proceeds
 * after the pause has been persisted successfully.
 */
export const createPauseTutorialRunUseCase =
  ({ progressRepository, identitySessionRepository }: PauseTutorialRunDependencies) =>
  async (input: PauseTutorialRunInput): Promise<PauseTutorialRunResult> => {
    if (input.progress.status !== 'IN_PROGRESS') {
      throw new Error('Only an in-progress tutorial run can be paused.');
    }

    const resumeStep = resumePoint(input.progress, input.steps);

    let progressToPause = input.progress;
    let pausedProgress: ProgressRecord;

    try {
      if (input.trigger === 'ACCESS_LOSS') {
        progressToPause = await progressRepository.save(input.progress);
      }

      pausedProgress = await progressRepository.save({
        ...progressToPause,
        status: 'PAUSED',
        currentStepId: resumeStep.id,
        updatedAt: input.pausedAt,
      });
    } catch (error) {
      return {
        ok: false,
        progress: input.progress,
        error,
      };
    }

    if (input.trigger === 'SIGN_OUT') {
      await identitySessionRepository.signOut();
    }

    return {
      ok: true,
      progress: pausedProgress,
    };
  };
