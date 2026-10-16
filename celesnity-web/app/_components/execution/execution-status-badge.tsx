'use client';

import {
  executionStatusTone,
  type ExecutionStatus,
  type ExecutionStatusTone,
} from '@/src/entities/models/execution';
import { Badge } from '@/app/_components/ui/badge';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';

/**
 * The status tones map onto the shared `Badge` variants rather than a private
 * class table. The old table painted `success` as `bg-accent text-primary` —
 * the blue hover surface — so a succeeded run read blue here and green
 * everywhere else in the workspace.
 */
const VARIANTS: Readonly<
  Record<ExecutionStatusTone, 'info' | 'warning' | 'success' | 'danger' | 'secondary'>
> = {
  pending: 'info',
  active: 'warning',
  success: 'success',
  danger: 'danger',
  muted: 'secondary',
};

const LABELS: Readonly<Record<ExecutionStatus, TranslationKey>> = {
  queued: 'execution.status.queued',
  preparing: 'execution.status.preparing',
  submitted: 'execution.status.submitted',
  running: 'execution.status.running',
  cancelling: 'execution.status.cancelling',
  succeeded: 'execution.status.succeeded',
  failed: 'execution.status.failed',
  cancelled: 'execution.status.cancelled',
  timed_out: 'execution.status.timedOut',
};

interface ExecutionStatusBadgeProps {
  readonly status: ExecutionStatus;
}

export function ExecutionStatusBadge({ status }: ExecutionStatusBadgeProps) {
  const { t } = useTranslation();
  const tone = executionStatusTone(status);

  return (
    <Badge className="shrink-0" variant={VARIANTS[tone]}>
      <span
        aria-hidden="true"
        className={
          tone === 'active'
            ? 'size-1.5 animate-status-pulse rounded-full bg-current'
            : 'size-1.5 rounded-full bg-current'
        }
      />
      {t(LABELS[status])}
    </Badge>
  );
}
