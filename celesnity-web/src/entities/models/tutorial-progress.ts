export type TutorialStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';

export interface ContextSelection {
  readonly requirementId: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface ProgressRecord {
  readonly tutorialId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly status: TutorialStatus;
  readonly currentStepId: string;
  readonly completedStepIds: readonly string[];
  readonly contextSelections: readonly ContextSelection[];
  readonly updatedAt: string;
}

interface OrderedTutorialStep {
  readonly id: string;
  readonly order: number;
}

/**
 * Calculates completion as a whole-number percentage. Invalid or zero totals
 * cannot produce progress, while out-of-range completion counts are clamped.
 */
export function progressPercentage(completedDistinct: number, totalSteps: number): number {
  if (!Number.isFinite(completedDistinct) || !Number.isFinite(totalSteps) || totalSteps <= 0) {
    return 0;
  }

  const percentage = (completedDistinct / totalSteps) * 100;
  const clamped = Math.min(100, Math.max(0, percentage));

  return Math.floor(clamped + 0.5);
}

/** Adds a completed step once without mutating the persisted progress record. */
export function markStepComplete(record: ProgressRecord, stepId: string): ProgressRecord {
  if (record.completedStepIds.includes(stepId)) {
    return record;
  }

  return {
    ...record,
    completedStepIds: [...record.completedStepIds, stepId],
  };
}

/** Returns the lowest-ordered step that has not yet been completed. */
export function resumePoint<Step extends OrderedTutorialStep>(
  record: ProgressRecord,
  steps: readonly Step[],
): Step {
  const completedStepIds = new Set(record.completedStepIds);
  const firstIncompleteStep = [...steps]
    .sort((left, right) => left.order - right.order)
    .find((step) => !completedStepIds.has(step.id));

  if (firstIncompleteStep === undefined) {
    throw new RangeError('A resume point requires at least one incomplete tutorial step.');
  }

  return firstIncompleteStep;
}

/** Idempotent completion outcome uniquely keyed by a tutorial run. */
export interface CompletionRecord {
  readonly runId: string;
  readonly completedAt: string;
}
