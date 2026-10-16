'use client';

import { Button } from '@/app/_components/ui/button';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { FriendlyRunError } from './activity-display';

interface RunErrorCardProps {
  readonly error: FriendlyRunError;
  readonly onRetry?: () => void;
}

export function RunErrorCard({ error, onRetry }: RunErrorCardProps) {
  const { t } = useTranslation();
  const message = error.message ?? t(error.messageKey ?? 'chat.runError.generic');

  return (
    <div
      role="alert"
      className="flex w-full max-w-[56rem] flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-body-sm leading-relaxed text-destructive min-[481px]:px-4"
    >
      <span>{message}</span>
      {error.retryable && onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t('chat.runError.retry')}
        </Button>
      )}
    </div>
  );
}
