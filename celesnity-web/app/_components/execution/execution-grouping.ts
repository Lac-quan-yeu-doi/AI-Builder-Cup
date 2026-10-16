import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';

export interface ExecutionDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  readonly key: string;
  readonly runs: readonly ExecutionSummaryViewModel[];
}

/** When a run happened: finished if it has, otherwise when it was queued. */
export function executionAt(run: ExecutionSummaryViewModel): string {
  return run.finishedAt ?? run.startedAt ?? run.queuedAt;
}

function localDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  // Local, not UTC: a run at 23:30 belongs to the day the operator saw it.
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Runs in day buckets, newest first.
 *
 * A flat list of timestamps makes "did anything run today" a reading exercise.
 * Grouping answers it in the heading, which is also what lets each row drop its
 * date and keep only a clock time.
 */
export function groupExecutionsByDay(
  executions: readonly ExecutionSummaryViewModel[],
): readonly ExecutionDay[] {
  const buckets = new Map<string, ExecutionSummaryViewModel[]>();

  for (const run of [...executions].sort((a, b) => executionAt(b).localeCompare(executionAt(a)))) {
    const key = localDay(executionAt(run));
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [run]);
    } else {
      bucket.push(run);
    }
  }

  return [...buckets.entries()].map(([key, runs]) => ({ key, runs }));
}

/** `today`, `yesterday`, or `undefined` when it deserves a real date. */
export function relativeDay(key: string, now = new Date()): 'today' | 'yesterday' | undefined {
  const today = localDay(now.toISOString());
  if (key === today) {
    return 'today';
  }
  const before = new Date(now);
  before.setDate(before.getDate() - 1);
  return key === localDay(before.toISOString()) ? 'yesterday' : undefined;
}
