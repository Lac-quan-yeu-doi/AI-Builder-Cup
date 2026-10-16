import type {
  WorkflowAutomaticTrigger,
  WorkflowCalendarTrigger,
} from '@domain/data-workflow/models/workflow-trigger';

export type NextCalendarOccurrence = (trigger: WorkflowCalendarTrigger, after: Date) => Date;

/**
 * Finds one future occurrence. Callers pass the current wall-clock instant, so
 * this deliberately coalesces any missed occurrences instead of backfilling a
 * queue after a worker outage.
 */
export function nextWorkflowOccurrence(
  trigger: WorkflowAutomaticTrigger,
  after: Date,
  nextCalendarOccurrence: NextCalendarOccurrence,
): Date {
  requireInstant(after, 'after');
  if (trigger.type === 'CALENDAR') {
    const next = nextCalendarOccurrence(trigger, after);
    requireInstant(next, 'calendar occurrence');
    if (next.getTime() <= after.getTime()) {
      throw new Error('Calendar occurrence must be after the supplied instant.');
    }
    return next;
  }

  const anchor = new Date(trigger.anchorAt);
  requireInstant(anchor, 'interval anchor');
  const intervalMilliseconds = trigger.everySeconds * 1_000;
  if (!Number.isSafeInteger(trigger.everySeconds) || intervalMilliseconds < 10_000) {
    throw new Error('Interval duration must be at least 10 seconds.');
  }

  if (after.getTime() < anchor.getTime()) {
    return anchor;
  }

  const elapsedIntervals = Math.floor((after.getTime() - anchor.getTime()) / intervalMilliseconds);
  const next = new Date(anchor.getTime() + (elapsedIntervals + 1) * intervalMilliseconds);
  requireInstant(next, 'interval occurrence');
  return next;
}

function requireInstant(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid UTC instant.`);
  }
}
