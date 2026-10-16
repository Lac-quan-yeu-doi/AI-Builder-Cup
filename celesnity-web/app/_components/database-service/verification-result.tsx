import type { DatabaseServiceVerificationStatus } from '@/src/entities/models/database-service';
import type { DatabaseServiceVerificationViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { cn } from '@/app/_components/ui/utils';

interface VerificationBadgeProps {
  readonly status: DatabaseServiceVerificationStatus;
}

const badgeTones: Readonly<Record<DatabaseServiceVerificationStatus, BadgeVariant>> = {
  succeeded: 'success',
  failed: 'danger',
  untested: 'secondary',
};

export function VerificationBadge({ status }: VerificationBadgeProps) {
  const label = status === 'succeeded' ? 'Verified' : status === 'failed' ? 'Failed' : 'Untested';

  return (
    <Badge variant={badgeTones[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </Badge>
  );
}

interface VerificationResultProps {
  readonly result: DatabaseServiceVerificationViewModel;
  readonly compact?: boolean;
}

export function VerificationResult({ result, compact = false }: VerificationResultProps) {
  const succeeded = result.status === 'succeeded';

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border',
        succeeded
          ? 'border-status-success/30 bg-status-success-light text-status-success-dark'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
        compact ? 'mb-[14px] px-3 py-[11px]' : 'mt-[17px] p-[14px]',
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className="grid size-[23px] flex-none place-items-center rounded-full border border-current text-caption font-semibold"
        aria-hidden="true"
      >
        {succeeded ? '✓' : '!'}
      </span>
      <div>
        <strong className="block text-caption">
          {succeeded ? 'Data connection verified' : 'Data connection not verified'}
        </strong>
        <p className="my-1 text-caption leading-[1.45] opacity-[0.86]">
          {succeeded
            ? 'The endpoint is reachable and accepted the supplied credentials.'
            : (result.message ??
              'Check the endpoint, credentials, SSL mode, and execution-network access.')}
        </p>
        <small className="text-micro opacity-70">Tested {formatTimestamp(result.testedAt)}</small>
      </div>
    </div>
  );
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
