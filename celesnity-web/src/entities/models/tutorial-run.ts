import type { TutorialStep } from '@/src/entities/models/tutorial-definition';
import type { ProgressRecord } from '@/src/entities/models/tutorial-progress';

export interface ForwardAvailabilityState {
  readonly targetLocated: boolean;
  readonly destinationTransitionComplete: boolean;
}

const DEFAULT_FORWARD_AVAILABILITY: ForwardAvailabilityState = Object.freeze({
  targetLocated: true,
  destinationTransitionComplete: true,
});

/**
 * Reports whether all domain and caller-owned runtime conditions permit forward navigation.
 */
export function canAdvanceNext(
  step: TutorialStep,
  record: ProgressRecord,
  availability: ForwardAvailabilityState = DEFAULT_FORWARD_AVAILABILITY,
): boolean {
  const targetReady = step.targetControl === undefined || availability.targetLocated;
  const actionReady =
    step.requiredAction === undefined || record.completedStepIds.includes(step.id);

  return targetReady && actionReady && availability.destinationTransitionComplete;
}

export function isFirstStep(step: TutorialStep, steps: readonly TutorialStep[]): boolean {
  return steps[0]?.id === step.id;
}

export function isFinalStep(step: TutorialStep, steps: readonly TutorialStep[]): boolean {
  return steps.at(-1)?.id === step.id;
}

/**
 * Applies the terminal run status without moving beyond the final step.
 */
export function applyCompletion(record: ProgressRecord): ProgressRecord {
  if (record.status === 'COMPLETED') {
    return record;
  }

  return {
    ...record,
    status: 'COMPLETED',
  };
}
