import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface RepeatTutorialInput {
  readonly progress: ProgressRecord;
  /** Omit to request confirmation, false to decline, and true to repeat. */
  readonly confirmed?: boolean;
}

export type RepeatTutorialResult =
  | {
      readonly outcome: 'CONFIRMATION_REQUIRED';
      readonly progress: ProgressRecord;
    }
  | {
      readonly outcome: 'DECLINED';
      readonly progress: ProgressRecord;
    }
  | {
      readonly outcome: 'REPEATED';
      readonly run: ProgressRecord;
      readonly destinationHref: string;
    };

export interface RepeatTutorialDependencies {
  readonly tutorialRepository: Pick<TutorialRepository, 'getDefinition'>;
  readonly progressRepository: Pick<TutorialProgressRepository, 'save'>;
  readonly now?: () => string;
}

export type RepeatTutorialUseCase = ReturnType<typeof createRepeatTutorialUseCase>;

const currentTimestamp = (): string => new Date().toISOString();

/**
 * Requires an explicit confirmation before replacing saved progress with a
 * fresh first-step run. Workspace resources and completion records are
 * preserved because this operation writes only the ProgressRecord.
 */
export const createRepeatTutorialUseCase = (dependencies: RepeatTutorialDependencies) => {
  const now = dependencies.now ?? currentTimestamp;

  return async (input: RepeatTutorialInput): Promise<RepeatTutorialResult> => {
    if (input.progress.status === 'NOT_STARTED') {
      throw new Error('A tutorial without saved progress should be started normally.');
    }

    if (input.confirmed === undefined) {
      return {
        outcome: 'CONFIRMATION_REQUIRED',
        progress: input.progress,
      };
    }

    if (!input.confirmed) {
      return {
        outcome: 'DECLINED',
        progress: input.progress,
      };
    }

    const definition = await dependencies.tutorialRepository.getDefinition(
      input.progress.tutorialId,
    );
    const firstStep = [...definition.steps].sort((left, right) => left.order - right.order)[0];

    if (firstStep === undefined) {
      throw new RangeError('A repeated tutorial requires at least one tutorial step.');
    }

    const repeatedRun = await dependencies.progressRepository.save({
      ...input.progress,
      status: 'IN_PROGRESS',
      currentStepId: firstStep.id,
      completedStepIds: [],
      contextSelections: input.progress.contextSelections.map((selection) => ({
        ...selection,
      })),
      updatedAt: now(),
    });

    return {
      outcome: 'REPEATED',
      run: repeatedRun,
      destinationHref: firstStep.destinationHref,
    };
  };
};
