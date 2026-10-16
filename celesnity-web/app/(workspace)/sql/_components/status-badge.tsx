'use client';

import type { SqlExecutionStatus } from '@/src/entities/models/query';
import { cn } from '@/app/_components/ui/utils';
import { statusLabel } from './format';

/**
 * On the shared `status-*` scales rather than raw Tailwind ones, so a query's
 * status reads as the same colour as the same status everywhere else. `succeeded`
 * stays on `accent` on purpose: a finished query is the resting state, not a
 * result worth colouring green.
 */
const STATUS_CLASS: Record<SqlExecutionStatus, string> = {
  queued: 'bg-status-info-light text-status-info-dark',
  submitted: 'bg-status-info-light text-status-info-dark',
  running: 'bg-status-info-light text-status-info-dark',
  cancelling: 'bg-status-info-light text-status-info-dark',
  succeeded: 'bg-accent text-primary',
  failed: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-status-warning-light text-status-warning-dark',
  timed_out: 'bg-destructive/15 text-destructive',
};

interface StatusBadgeProps {
  readonly status: SqlExecutionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] rounded-full px-[9px] py-1 text-micro font-semibold tracking-[0.02em]',
        STATUS_CLASS[status],
      )}
    >
      <span className="size-[6px] rounded-full bg-current" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
