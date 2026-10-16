import { formatDuration } from '@/app/_components/execution/execution-format';
import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';

/**
 * Day and time, without the year.
 *
 * An overview is read against "now", so the year is almost always this one and
 * spends width saying so. `formatTimestamp` keeps it for the run detail, where
 * the record is being read rather than scanned.
 */
export function formatWrittenAt(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "2 hours ago", in the reader's locale.
 *
 * A list of runs is scanned for recency, not for wall-clock time; the exact
 * timestamp stays one click away in the detail.
 */
export function formatRelative(
  value: string | undefined,
  locale?: string,
  now = Date.now(),
): string {
  if (value === undefined) {
    return '—';
  }
  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return '—';
  }

  const elapsed = at - now;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const magnitude = Math.abs(elapsed);

  if (magnitude < HOUR) {
    return format.format(Math.round(elapsed / MINUTE), 'minute');
  }
  if (magnitude < DAY) {
    return format.format(Math.round(elapsed / HOUR), 'hour');
  }
  return format.format(Math.round(elapsed / DAY), 'day');
}

/** How long a run took, or an em dash while it has not finished. */
export function formatRunDuration(run: ExecutionSummaryViewModel): string {
  return formatDuration(run.startedAt, run.finishedAt) ?? '—';
}
