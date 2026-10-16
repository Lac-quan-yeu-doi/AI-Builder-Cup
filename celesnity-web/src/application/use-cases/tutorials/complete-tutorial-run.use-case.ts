import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { CompletionRecord, ProgressRecord } from '@/src/entities/models/tutorial-progress';
import { applyCompletion } from '@/src/entities/models/tutorial-run';

export interface CompleteTutorialRunInput {
  readonly runId: string;
  readonly progress: ProgressRecord;
}

export type CompleteTutorialRunResult =
  | {
      readonly ok: true;
      readonly progress: ProgressRecord;
      readonly completion: CompletionRecord;
    }
  | {
      readonly ok: false;
      /** The unchanged pre-completion state retained after persistence failure. */
      readonly progress: ProgressRecord;
      readonly error: unknown;
    };

export interface CompleteTutorialRunDependencies {
  readonly progressRepository: Pick<TutorialProgressRepository, 'save' | 'saveCompletion'>;
  readonly now?: () => string;
}

export type CompleteTutorialRunUseCase = ReturnType<typeof createCompleteTutorialRunUseCase>;

const currentTimestamp = (): string => new Date().toISOString();

/**
 * Persists COMPLETED status before reporting one idempotent completion outcome.
 * Repeated requests reuse the repository's run-keyed CompletionRecord without
 * rewriting an already-completed ProgressRecord.
 */
export const createCompleteTutorialRunUseCase = (dependencies: CompleteTutorialRunDependencies) => {
  const now = dependencies.now ?? currentTimestamp;

  return async (input: CompleteTutorialRunInput): Promise<CompleteTutorialRunResult> => {
    if (input.progress.status !== 'IN_PROGRESS' && input.progress.status !== 'COMPLETED') {
      throw new Error('Only an in-progress tutorial run can be completed.');
    }

    try {
      const completedProgress =
        input.progress.status === 'COMPLETED'
          ? input.progress
          : await dependencies.progressRepository.save(
              applyCompletion({ ...input.progress, updatedAt: now() }),
            );
      const completion = await dependencies.progressRepository.saveCompletion(input.runId);

      return {
        ok: true,
        progress: completedProgress,
        completion,
      };
    } catch (error) {
      return {
        ok: false,
        progress: input.progress,
        error,
      };
    }
  };
};
