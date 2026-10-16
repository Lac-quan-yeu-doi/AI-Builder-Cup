'use client';

import { TriangleAlertIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/app/_components/ui/alert';
import { Button } from '@/app/_components/ui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/app/_components/ui/marker';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Spinner } from '@/app/_components/ui/spinner';
import { useTranslation } from '@/app/_i18n/use-translation';

export function PaneStateLoading({ label }: { readonly label: string }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Marker>
        <MarkerIcon>
          <Spinner />
        </MarkerIcon>
        <MarkerContent>{label}</MarkerContent>
      </Marker>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-[110px] w-full" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

export function PaneStateFailed({
  title,
  description,
  onRetry,
}: {
  readonly title: string;
  readonly description: string;
  readonly onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex max-w-md flex-col gap-3">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            {t('chat.retryConnection')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PaneStateStale({
  message,
  onShowLatest,
}: {
  readonly message: string;
  readonly onShowLatest?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 border-b border-border bg-status-warning-light px-3 py-2 text-sm text-status-warning-dark ">
      <TriangleAlertIcon className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onShowLatest ? (
        <Button size="xs" variant="outline" onClick={onShowLatest}>
          {t('chat.pane.showLatest')}
        </Button>
      ) : null}
    </div>
  );
}
