'use client';

import type { SqlExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/query.presenter';
import { formatDateTime, formatInteger } from './format';
import { Button } from '@/app/_components/ui/button';
import { cn } from '@/app/_components/ui/utils';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Card } from '@/app/_components/ui/card';
import { StatusBadge } from './status-badge';

interface ExecutionHistoryProps {
  readonly history?: readonly SqlExecutionSummaryViewModel[];
  readonly loading: boolean;
  readonly error: boolean;
  readonly selectedId?: string;
  readonly disabled: boolean;
  readonly onSelect: (id: string) => void;
  readonly onRetry: () => void;
}

export function ExecutionHistory({
  history,
  loading,
  error,
  selectedId,
  disabled,
  onSelect,
  onRetry,
}: ExecutionHistoryProps) {
  return (
    <Card
      className="overflow-auto p-[18px] min-[901px]:sticky min-[901px]:top-[22px] min-[901px]:max-h-[calc(100vh-44px)]"
      asChild
    >
      <aside aria-label="SQL execution history">
        <div className="mb-[14px] flex items-center justify-between gap-[14px]">
          <h3 className="m-0 text-body-lg font-medium tracking-[-0.02em]">History</h3>
          {history ? (
            <span className="inline-grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-caption font-semibold text-primary">
              {history.length}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="grid gap-[9px] text-caption text-muted-foreground" role="status">
            <Skeleton className="h-[44px] rounded-lg" />
            <Skeleton className="h-[44px] rounded-lg" />
            <Skeleton className="h-[44px] rounded-lg" />
            <p>Loading history…</p>
          </div>
        ) : null}

        {error ? (
          <div
            className="grid gap-[10px] rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-caption text-destructive"
            role="alert"
          >
            <p className="m-0">History could not be loaded.</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : null}

        {history && history.length === 0 && !error ? (
          <p className="my-2 text-caption leading-[1.55] text-muted-foreground">
            No statements have been submitted yet.
          </p>
        ) : null}

        {history && history.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'grid w-full cursor-pointer gap-[7px] rounded-lg border border-border bg-card px-3 py-[11px] text-left transition-[border-color,background] duration-150 ease-[ease] disabled:cursor-wait disabled:opacity-[0.65] not-disabled:hover:border-border not-disabled:hover:bg-accent',
                    item.id === selectedId && 'border-primary/40 bg-accent',
                  )}
                  disabled={disabled}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="flex items-center justify-between gap-[10px]">
                    <StatusBadge status={item.status} />
                    <time className="text-micro text-muted-foreground" dateTime={item.queuedAt}>
                      {formatDateTime(item.queuedAt)}
                    </time>
                  </span>
                  <code className="overflow-hidden font-mono text-micro leading-[1.4] text-ellipsis whitespace-nowrap text-foreground">
                    {item.statementPreview}
                  </code>
                  <span className="flex flex-wrap gap-x-[10px] gap-y-1 text-micro text-muted-foreground">
                    <span>
                      {item.namespace ? `${item.catalog}.${item.namespace}` : item.catalog}
                    </span>
                    {item.rowCount !== undefined ? (
                      <span>{formatInteger(item.rowCount)} rows</span>
                    ) : null}
                    {item.errorCode ? (
                      <span className="font-[750] text-destructive">{item.errorCode}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </Card>
  );
}
