'use client';

import { useCallback, useEffect, useState, type ComponentProps } from 'react';

import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { CheckIcon, ClockIcon, CloseIcon } from '@/app/_components/ui/icons';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { Translator } from '@/app/_i18n/translate';
import type { ApprovePendingActionController } from '@/src/interface-adapters/controllers/pending-actions/approve-pending-action.controller';
import type { ListPendingActionsController } from '@/src/interface-adapters/controllers/pending-actions/list-pending-actions.controller';
import type { RejectPendingActionController } from '@/src/interface-adapters/controllers/pending-actions/reject-pending-action.controller';
import type { PendingActionViewModel } from '@/src/interface-adapters/presenters/pending-action.presenter';

interface PendingActionsForRunProps {
  readonly runId: string;
  readonly listPendingActions: ListPendingActionsController;
  readonly approvePendingAction: ApprovePendingActionController;
  readonly rejectPendingAction: RejectPendingActionController;
  /** Rendered when the run has no pending actions. Omit to render nothing (the inline-transcript case). */
  readonly emptyLabel?: string;
}

/** Loads and renders every pending action proposed under one run, inline in the transcript. */
export function PendingActionsForRun({
  runId,
  listPendingActions,
  approvePendingAction,
  rejectPendingAction,
  emptyLabel,
}: PendingActionsForRunProps) {
  const [actions, setActions] = useState<readonly PendingActionViewModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    listPendingActions({ runId })
      .then((result) => {
        if (!cancelled) setActions(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [listPendingActions, runId]);

  const handleDecided = useCallback((updated: PendingActionViewModel) => {
    setActions((previous) =>
      previous.map((action) => (action.id === updated.id ? updated : action)),
    );
  }, []);

  if (actions.length === 0) {
    return emptyLabel ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null;
  }

  return (
    <div className="flex w-full max-w-[56rem] flex-col gap-2">
      {actions.map((action) => (
        <PendingActionCard
          key={action.id}
          action={action}
          onApprove={() => approvePendingAction(action.id).then(handleDecided)}
          onReject={() => rejectPendingAction(action.id).then(handleDecided)}
        />
      ))}
    </div>
  );
}

interface PendingActionCardProps {
  readonly action: PendingActionViewModel;
  readonly onApprove: () => Promise<void>;
  readonly onReject: () => Promise<void>;
}

/** The reusable "tool-call card" shape: a concise approval request with optional diagnostics. */
export function PendingActionCard({ action, onApprove, onReject }: PendingActionCardProps) {
  const { t } = useTranslation();
  const expired = action.status === 'pending' && new Date() >= new Date(action.expiresAt);
  const waiting = action.status === 'pending' && !expired;
  const [open, setOpen] = useState(!waiting);
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (kind: 'approve' | 'reject', run: () => Promise<void>) => {
    setDeciding(kind);
    setError(null);
    try {
      await run();
    } catch {
      setError(t('chat.pendingAction.error'));
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="w-full max-w-[56rem] rounded-2xl border border-border bg-card px-3 py-3 sm:px-4 sm:py-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start justify-between gap-3 border-0 bg-transparent p-0 text-left"
      >
        <span className="min-w-0">
          {waiting && (
            <span className="block text-micro font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {t('chat.pendingAction.waitingForYou')}
            </span>
          )}
          <span className={cn('block text-body-sm font-medium text-foreground', waiting && 'mt-3')}>
            {action.actionName}
          </span>
        </span>
        {waiting ? (
          <span className="sr-only">{t('chat.pendingAction.pending')}</span>
        ) : (
          <StatusBadge action={action} expired={expired} deciding={deciding} t={t} />
        )}
      </button>

      {waiting && (
        <>
          <p className="m-0 mt-2.5 text-caption leading-relaxed text-muted-foreground">
            {approvalSummary(action, t)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              aria-busy={deciding === 'approve'}
              disabled={deciding !== null}
              onClick={() => void decide('approve', onApprove)}
            >
              {t('chat.pendingAction.approve')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={deciding !== null}
              onClick={() => void decide('reject', onReject)}
            >
              {t('chat.pendingAction.reject')}
            </Button>
            <span className="text-caption text-muted-foreground">
              {t('chat.pendingAction.orAnswerBelow')}
            </span>
          </div>
        </>
      )}

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <JsonSection label={t('chat.pendingAction.input')} value={action.input} />
          {action.rationale && (
            <p className="m-0 text-caption text-muted-foreground">
              <span className="font-medium text-muted-foreground">
                {t('chat.pendingAction.rationale')}:{' '}
              </span>
              {action.rationale}
            </p>
          )}
          {(action.result !== null || action.errorMessage) && (
            <JsonSection
              label={t('chat.pendingAction.output')}
              value={action.errorMessage ?? action.result}
            />
          )}
          {error && (
            <p role="alert" className="m-0 text-caption text-destructive">
              {error}
            </p>
          )}
          {!waiting && action.status === 'pending' && !expired && (
            <div className="mt-1 flex justify-end gap-2">
              <Button
                variant="destructive-ghost"
                size="xs"
                disabled={deciding !== null}
                onClick={() => void decide('reject', onReject)}
              >
                <CloseIcon size={16} />
                {t('chat.pendingAction.reject')}
              </Button>
              <Button
                variant="default"
                size="xs"
                aria-busy={deciding === 'approve'}
                disabled={deciding !== null}
                onClick={() => void decide('approve', onApprove)}
              >
                <CheckIcon size={16} />
                {t('chat.pendingAction.approve')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function approvalSummary(action: PendingActionViewModel, t: Translator): string {
  const input = asRecord(action.input);
  const target = firstString(input, ['target', 'recipient', 'to', 'destination']);
  const detail = firstString(input, ['detail', 'description', 'summary', 'message']);
  const irreversible = input['reversible'] === false || input['irreversible'] === true;
  const parts: Array<string | null> = [target, detail];
  if (target === null && detail === null) parts[0] = formatInputSummary(input);
  if (action.rationale && !parts.includes(action.rationale)) parts.push(action.rationale);
  if (irreversible) parts.push(t('chat.pendingAction.irreversible'));
  return parts.filter((part): part is string => part !== null && part.length > 0).join(' · ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(input: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].length > 0) return input[key];
  }
  return null;
}

function formatInputSummary(input: Record<string, unknown>): string | null {
  const entries = Object.entries(input).slice(0, 3);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`).join(' · ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
function StatusBadge({
  action,
  expired,
  deciding,
  t,
}: {
  readonly action: PendingActionViewModel;
  readonly expired: boolean;
  readonly deciding: 'approve' | 'reject' | null;
  readonly t: Translator;
}) {
  const { text, showClock } = statusLabel(action, expired, deciding, t);
  const tone: NonNullable<ComponentProps<typeof Badge>['variant']> =
    action.status === 'rejected' || action.status === 'failed'
      ? 'danger'
      : action.status === 'approved'
        ? 'success'
        : expired
          ? 'secondary'
          : 'warning';
  return (
    <Badge variant={tone} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {showClock && <ClockIcon size={12} />}
      {text}
    </Badge>
  );
}

interface StatusLabel {
  readonly text: string;
  /** True once a decided action's duration is shown in place of a status word — the caller renders a clock glyph next to it instead of baking the glyph into the text itself. */
  readonly showClock: boolean;
}

function statusLabel(
  action: PendingActionViewModel,
  expired: boolean,
  deciding: 'approve' | 'reject' | null,
  t: Translator,
): StatusLabel {
  if (deciding === 'approve') return { text: t('chat.pendingAction.running'), showClock: false };
  if (action.status === 'pending' && expired) {
    return { text: t('chat.pendingAction.expired'), showClock: false };
  }
  if (action.status === 'pending')
    return { text: t('chat.pendingAction.pending'), showClock: false };
  if (action.status === 'rejected')
    return { text: t('chat.pendingAction.rejected'), showClock: false };
  if (action.status === 'failed') return { text: t('chat.pendingAction.failed'), showClock: false };
  if (action.decidedAt) {
    return { text: formatDuration(action.createdAt, action.decidedAt), showClock: true };
  }
  return { text: t('chat.pendingAction.approved'), showClock: false };
}

function formatDuration(createdAt: string, decidedAt: string): string {
  const ms = new Date(decidedAt).getTime() - new Date(createdAt).getTime();
  return `${Math.max(0, ms / 1000).toFixed(3)}s`;
}

function JsonSection({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <div>
      <p className="m-0 mb-1 text-micro font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="m-0 overflow-x-auto rounded-lg bg-muted p-2 text-caption">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
