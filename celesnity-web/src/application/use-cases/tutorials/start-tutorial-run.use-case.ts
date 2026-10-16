import type { TutorialProgressRepository } from '@/src/application/repositories/tutorial-progress.repository.interface';
import type { TutorialRepository } from '@/src/application/repositories/tutorial.repository.interface';
import type { TutorialId } from '@/src/entities/models/tutorial-definition';
import type { ContextSelection, ProgressRecord } from '@/src/entities/models/tutorial-progress';

export type StartTutorialConflictResolution = 'PAUSE_ACTIVE' | 'CANCEL_NEW_START';

export interface StartTutorialRunInput {
  readonly tutorialId: TutorialId;
  readonly memberId: string;
  readonly organizationId: string;
  readonly contextSelections: readonly ContextSelection[];
  readonly conflictResolution?: StartTutorialConflictResolution;
}

export type StartTutorialRunResult =
  | {
      readonly outcome: 'STARTED';
      readonly run: ProgressRecord;
      readonly destinationHref: string;
    }
  | {
      readonly outcome: 'CONFLICT_REQUIRES_CHOICE';
      readonly activeRun: ProgressRecord;
      readonly choices: readonly StartTutorialConflictResolution[];
    }
  | {
      readonly outcome: 'CANCELLED';
      readonly activeRun: ProgressRecord;
    }
  | {
      readonly outcome: 'PAUSE_FAILED';
      readonly activeRun: ProgressRecord;
      readonly reason: unknown;
    };

export interface StartTutorialRunDependencies {
  readonly tutorialRepository: TutorialRepository;
  readonly progressRepository: TutorialProgressRepository;
  readonly now?: () => string;
}

export type StartTutorialRunUseCase = ReturnType<typeof createStartTutorialRunUseCase>;

const CONFLICT_CHOICES = Object.freeze<readonly StartTutorialConflictResolution[]>([
  'PAUSE_ACTIVE',
  'CANCEL_NEW_START',
]);

const currentTimestamp = (): string => new Date().toISOString();

function findActiveRun(
  records: readonly ProgressRecord[],
  memberId: string,
  organizationId: string,
): ProgressRecord | undefined {
  return records.find(
    (record) =>
      record.memberId === memberId &&
      record.organizationId === organizationId &&
      record.status === 'IN_PROGRESS',
  );
}

/**
 * Starts a tutorial only after any active run has been explicitly resolved.
 * Returning a conflict result leaves persistence untouched so the caller can
 * request the member's pause-or-cancel choice.
 */
export const createStartTutorialRunUseCase = (dependencies: StartTutorialRunDependencies) => {
  const now = dependencies.now ?? currentTimestamp;

  return async (input: StartTutorialRunInput): Promise<StartTutorialRunResult> => {
    const records = await dependencies.progressRepository.listForMember();
    const activeRun = findActiveRun(records, input.memberId, input.organizationId);

    if (activeRun !== undefined) {
      if (input.conflictResolution === undefined) {
        return {
          outcome: 'CONFLICT_REQUIRES_CHOICE',
          activeRun,
          choices: CONFLICT_CHOICES,
        };
      }

      if (input.conflictResolution === 'CANCEL_NEW_START') {
        return { outcome: 'CANCELLED', activeRun };
      }

      const pausedRun: ProgressRecord = {
        ...activeRun,
        status: 'PAUSED',
        updatedAt: now(),
      };

      try {
        await dependencies.progressRepository.save(pausedRun);
      } catch (reason) {
        return { outcome: 'PAUSE_FAILED', activeRun, reason };
      }
    }

    const definition = await dependencies.tutorialRepository.getDefinition(input.tutorialId);
    const firstStep = [...definition.steps].sort((left, right) => left.order - right.order)[0];

    if (firstStep === undefined) {
      throw new RangeError('A tutorial run requires at least one tutorial step.');
    }

    const newRun: ProgressRecord = {
      tutorialId: definition.id,
      memberId: input.memberId,
      organizationId: input.organizationId,
      status: 'IN_PROGRESS',
      currentStepId: firstStep.id,
      completedStepIds: [],
      contextSelections: input.contextSelections.map((selection) => ({ ...selection })),
      updatedAt: now(),
    };
    const persistedRun = await dependencies.progressRepository.save(newRun);

    return {
      outcome: 'STARTED',
      run: persistedRun,
      destinationHref: firstStep.destinationHref,
    };
  };
};
