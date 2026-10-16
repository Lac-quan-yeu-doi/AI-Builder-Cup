'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isTerminalExecution } from '@/src/entities/models/execution';
import type { CancelExecutionController } from '@/src/interface-adapters/controllers/executions/cancel-execution.controller';
import type { GetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import type { GetExecutionController } from '@/src/interface-adapters/controllers/executions/get-execution.controller';
import type { ListExecutionsController } from '@/src/interface-adapters/controllers/executions/list-executions.controller';
import type { MonitorExecutionController } from '@/src/interface-adapters/controllers/executions/monitor-execution.controller';
import type { RerunExecutionController } from '@/src/interface-adapters/controllers/executions/rerun-execution.controller';
import type { ListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import type {
  ExecutionDetailViewModel,
  ExecutionProgressViewModel,
  ExecutionSummaryViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';
import { contextualErrorMessage } from '@/app/_components/shared/error-message';
import { ExecutionDetail } from './execution-detail';
import { ExecutionList } from './execution-list';
import { shortIdentifier } from './execution-format';
import { useExecutionLiveProgress } from './use-execution-live-progress';
import { cn } from '@/app/_components/ui/utils';
import { EmptyBlock } from '@/app/_components/ui/empty-state';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { Spinner } from '@/app/_components/ui/spinner';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import type { TranslationKey } from '@/app/_i18n/en';
import { useTranslation } from '@/app/_i18n/use-translation';
import { Card } from '@/app/_components/ui/card';

const placeholderClass =
  'flex min-h-[420px] flex-col items-center justify-center px-7 py-10 text-center';
const placeholderMarkClass =
  'mb-[15px] grid size-[46px] place-items-center rounded-xl font-mono text-caption font-[850]';
const placeholderHeadingClass = 'm-0 text-heading-3 font-medium';
const placeholderCopyClass =
  'mt-[10px] mb-5 max-w-[420px] text-body-sm leading-[1.6] text-muted-foreground';

type DetailState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly execution: ExecutionDetailViewModel }
  | { readonly kind: 'error'; readonly message: string };

type Feedback = { readonly tone: 'info' | 'error'; readonly message: string };

type StatusFilter = 'all' | 'succeeded' | 'failed';

/** Cancelled and timed out read as failures to anyone scanning for trouble. */
const FAILED_STATUSES: ReadonlySet<string> = new Set(['failed', 'timed_out', 'cancelled']);

const STATUS_FILTERS: readonly {
  readonly value: StatusFilter;
  readonly labelKey: TranslationKey;
}[] = [
  { value: 'all', labelKey: 'executions.filterAll' },
  { value: 'succeeded', labelKey: 'executions.filterSucceeded' },
  { value: 'failed', labelKey: 'executions.filterFailed' },
];

interface ExecutionsScreenProps {
  /**
   * Restricts the list to these pipelines. A run belongs to the database its
   * pipeline writes into, and Core lists runs workspace-wide, so the narrowing
   * happens here.
   */
  readonly pipelineIds?: readonly string[];
  readonly initialExecutionId?: string;
  readonly onSelectionChange?: (executionId: string) => void;
  /** Rendered inside a container, which already supplies a heading. */
  readonly embedded?: boolean;
  readonly controllers: Readonly<{
    list: ListExecutionsController;
    get: GetExecutionController;
    cancel: CancelExecutionController;
    getLogs: GetExecutionLogsController;
    rerun: RerunExecutionController;
    monitor: MonitorExecutionController;
    listPipelines?: ListPipelinesController;
  }>;
}

export function ExecutionsScreen({
  controllers,
  embedded = false,
  initialExecutionId,
  onSelectionChange,
  pipelineIds,
}: ExecutionsScreenProps) {
  const { t } = useTranslation();
  const [executions, setExecutions] = useState<readonly ExecutionSummaryViewModel[]>();
  const [listError, setListError] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialExecutionId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [detailState, setDetailState] = useState<DetailState>(
    initialExecutionId ? { kind: 'loading' } : { kind: 'idle' },
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [pipelineNames, setPipelineNames] = useState<Readonly<Record<string, string>>>({});

  const selectedIdRef = useRef<string | undefined>(initialExecutionId);
  const previousInitialExecutionId = useRef(initialExecutionId);
  useEffect(() => {
    if (previousInitialExecutionId.current === initialExecutionId) {
      return;
    }
    previousInitialExecutionId.current = initialExecutionId;
    if (selectedIdRef.current === initialExecutionId) {
      return;
    }
    selectedIdRef.current = initialExecutionId;
    setSelectedId(initialExecutionId);
    setDetailState(initialExecutionId ? { kind: 'loading' } : { kind: 'idle' });
    setFeedback(undefined);
  }, [initialExecutionId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const scope = useCallback(
    (items: readonly ExecutionSummaryViewModel[]): readonly ExecutionSummaryViewModel[] =>
      pipelineIds === undefined
        ? items
        : items.filter(
            (execution) =>
              execution.pipelineId !== undefined && pipelineIds.includes(execution.pipelineId),
          ),
    [pipelineIds],
  );

  const loadList = useCallback(async (): Promise<
    readonly ExecutionSummaryViewModel[] | undefined
  > => {
    try {
      const items = scope(await controllers.list());
      setExecutions(items);
      setListError(undefined);
      return items;
    } catch (error) {
      setListError(
        contextualErrorMessage(
          error,
          'Executions could not be loaded. Confirm the Core API is running.',
        ),
      );
      return undefined;
    }
  }, [controllers, scope]);

  useEffect(() => {
    if (!controllers.listPipelines) return;
    let cancelled = false;
    void (async () => {
      const firstPage = await controllers.listPipelines?.({ page: 1, pageSize: 100 });
      if (!firstPage) return;
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, firstPage.totalPages - 1) }, (_, index) =>
          controllers.listPipelines?.({ page: index + 2, pageSize: 100 }),
        ),
      );
      if (!cancelled) {
        setPipelineNames(
          Object.fromEntries(
            [firstPage, ...remainingPages]
              .flatMap((page) => page?.items ?? [])
              .map((pipeline) => [pipeline.id, pipeline.name]),
          ),
        );
      }
    })().catch(() => {
      // Execution monitoring remains usable with ID fallbacks when pipeline
      // metadata is temporarily unavailable.
    });
    return () => {
      cancelled = true;
    };
  }, [controllers]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = scope(await controllers.list());
        if (!cancelled) {
          setExecutions(items);
          setListError(undefined);
        }
      } catch (error) {
        if (!cancelled) {
          setListError(
            contextualErrorMessage(
              error,
              'Executions could not be loaded. Confirm the Core API is running.',
            ),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controllers, scope]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let cancelled = false;
    controllers
      .get(selectedId)
      .then((execution) => {
        if (!cancelled) {
          setDetailState({ kind: 'ready', execution });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDetailState({
            kind: 'error',
            message: contextualErrorMessage(error, 'This execution could not be loaded.'),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controllers, selectedId, detailReloadToken]);

  const patchListItem = useCallback((id: string, patch: Partial<ExecutionSummaryViewModel>) => {
    setExecutions((current) =>
      current?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const applyProgress = useCallback(
    (progress: ExecutionProgressViewModel) => {
      if (progress.id !== selectedIdRef.current) {
        return;
      }
      setDetailState((current) => {
        if (current.kind !== 'ready' || current.execution.id !== progress.id) {
          return current;
        }
        return {
          kind: 'ready',
          execution: {
            ...current.execution,
            status: progress.status,
            updatedAt: progress.updatedAt,
            ...(progress.sparkApplicationId
              ? { sparkApplicationId: progress.sparkApplicationId }
              : {}),
            ...(progress.exitCode !== undefined ? { exitCode: progress.exitCode } : {}),
          },
        };
      });
      patchListItem(progress.id, {
        status: progress.status,
        updatedAt: progress.updatedAt,
        ...(progress.sparkApplicationId ? { sparkApplicationId: progress.sparkApplicationId } : {}),
        ...(progress.exitCode !== undefined ? { exitCode: progress.exitCode } : {}),
      });
    },
    [patchListItem],
  );

  const applySnapshot = useCallback(
    (execution: ExecutionDetailViewModel) => {
      if (execution.id !== selectedIdRef.current) {
        return;
      }
      setDetailState({ kind: 'ready', execution });
      patchListItem(execution.id, execution);
    },
    [patchListItem],
  );

  const readyExecution = detailState.kind === 'ready' ? detailState.execution : undefined;

  const liveMode = useExecutionLiveProgress({
    monitor: controllers.monitor,
    executionId: selectedId,
    enabled: readyExecution !== undefined && !isTerminalExecution(readyExecution.status),
    onProgress: applyProgress,
    onSnapshot: applySnapshot,
  });

  const selectExecution = (id: string) => {
    if (id === selectedId) {
      return;
    }
    selectedIdRef.current = id;
    setSelectedId(id);
    setDetailState({ kind: 'loading' });
    onSelectionChange?.(id);
  };

  const refresh = async () => {
    setIsRefreshing(true);
    await loadList();
    setIsRefreshing(false);
  };

  const cancelSelected = async () => {
    if (!readyExecution || isCancelling) {
      return;
    }
    setIsCancelling(true);
    setFeedback(undefined);
    try {
      const updated = await controllers.cancel(readyExecution.id);
      applySnapshot(updated);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: contextualErrorMessage(error, 'The execution could not be cancelled.'),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const rerunSelected = async () => {
    if (
      !readyExecution ||
      readyExecution.workloadKind !== 'SCRIPT' ||
      !readyExecution.scriptId ||
      !readyExecution.scriptVersionId ||
      isRerunning
    ) {
      return;
    }
    setIsRerunning(true);
    setFeedback(undefined);
    try {
      const outcome = await controllers.rerun({
        scriptId: readyExecution.scriptId,
        scriptVersionId: readyExecution.scriptVersionId,
      });
      if (outcome.kind === 'started') {
        await loadList();
        selectExecution(outcome.executionId);
        setFeedback({
          tone: 'info',
          message: `Started ${shortIdentifier(outcome.executionId)} from the same script version.`,
        });
      } else if (outcome.kind === 'version-missing') {
        setFeedback({
          tone: 'error',
          message: 'This script version no longer exists, so it cannot be rerun.',
        });
      } else {
        setFeedback({
          tone: 'error',
          message: outcome.message || 'This version cannot be rerun right now.',
        });
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: contextualErrorMessage(error, 'The rerun could not be started.'),
      });
    } finally {
      setIsRerunning(false);
    }
  };

  const counts = {
    all: executions?.length ?? 0,
    succeeded: executions?.filter((run) => run.status === 'succeeded').length ?? 0,
    failed: executions?.filter((run) => FAILED_STATUSES.has(run.status)).length ?? 0,
  };
  const visible = (executions ?? []).filter((run) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'succeeded'
        ? run.status === 'succeeded'
        : FAILED_STATUSES.has(run.status),
  );

  return (
    <section className="grid gap-5">
      {/* Embedded, the container already names the page; only Refresh has to
       * survive, or there is no way to reload the list at all. */}
      {embedded ? (
        <div className="flex justify-end">
          <Button disabled={isRefreshing} onClick={refresh} variant="outline">
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      ) : (
        <PageBar
          actions={
            <Button disabled={isRefreshing} onClick={refresh} variant="outline">
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          }
          description={t('page.executions.description')}
          title={t('page.executions.title')}
        />
      )}

      {feedback ? (
        <div
          className={cn(
            'flex min-h-[48px] items-center justify-between gap-4 rounded-lg border py-[11px] pr-[14px] pl-4 text-body-sm leading-[1.5]',
            feedback.tone === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-primary/30 bg-accent text-status-success-dark',
          )}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{feedback.message}</span>
          <button
            className="flex-none cursor-pointer border-0 bg-transparent text-title leading-none text-current"
            type="button"
            onClick={() => setFeedback(undefined)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 min-[1081px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5">
          {/* One control, not a heading block: the tab beside it already says
           * these are runs, and the filter is the only thing worth deciding
           * here. */}
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-4">
            {STATUS_FILTERS.map((option) => (
              <Button
                aria-pressed={statusFilter === option.value}
                className="rounded-full"
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                size="sm"
                variant={statusFilter === option.value ? 'default' : 'outline'}
              >
                {t(option.labelKey)}
                <span className="tabular-nums opacity-70">{counts[option.value]}</span>
              </Button>
            ))}
          </div>

          {!executions && !listError ? (
            <div className="grid gap-[10px]" aria-label="Loading executions" role="status">
              <Skeleton className="h-[92px] rounded-xl" />
              <Skeleton className="h-[92px] rounded-xl" />
              <Skeleton className="h-[92px] rounded-xl" />
            </div>
          ) : null}

          {listError ? (
            <EmptyBlock
              action={
                <Button onClick={refresh} size="sm" variant="link">
                  Try again
                </Button>
              }
              description={listError}
              role="alert"
              title="Executions are unavailable"
            />
          ) : null}

          {executions?.length === 0 && !listError ? (
            <EmptyBlock
              description="Run a published script version or a saved pipeline to see it tracked here."
              role="status"
              title="No executions yet"
            />
          ) : null}

          {executions && executions.length > 0 ? (
            <div className="min-h-0 overflow-y-auto lg:max-h-[70vh]">
              <ExecutionList
                executions={visible}
                pipelineNames={pipelineNames}
                {...(selectedId ? { selectedId } : {})}
                onSelect={selectExecution}
              />
            </div>
          ) : null}
        </Card>

        <Card className="gap-0 py-0 overflow-hidden">
          {detailState.kind === 'idle' ? (
            <div className={placeholderClass}>
              <span
                className={cn(placeholderMarkClass, 'bg-accent text-primary')}
                aria-hidden="true"
              >
                RUN
              </span>
              <h2 className={placeholderHeadingClass}>Select an execution</h2>
              <p className={placeholderCopyClass}>
                Choose a run from the list to inspect its lifecycle, live output, resource profile,
                and terminal result.
              </p>
            </div>
          ) : null}

          {detailState.kind === 'loading' ? (
            <div className={placeholderClass} role="status">
              <Spinner className="size-7 text-primary" />
              <h2 className={placeholderHeadingClass}>Loading execution…</h2>
              <p className={placeholderCopyClass}>Fetching the latest lifecycle state.</p>
            </div>
          ) : null}

          {detailState.kind === 'error' ? (
            <div className={placeholderClass} role="alert">
              <span
                className={cn(placeholderMarkClass, 'bg-destructive/15 text-destructive')}
                aria-hidden="true"
              >
                !
              </span>
              <h2 className={placeholderHeadingClass}>Could not load this execution</h2>
              <p className={placeholderCopyClass}>{detailState.message}</p>
              {selectedId ? (
                <button
                  type="button"
                  className="inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-md border border-transparent bg-primary px-[14px] py-2 text-caption font-semibold text-primary-foreground shadow-200 transition-[background,border-color,transform] duration-150 ease-[ease] disabled:cursor-wait disabled:opacity-60 not-disabled:hover:-translate-y-px not-disabled:hover:bg-primary/90"
                  onClick={() => {
                    setDetailState({ kind: 'loading' });
                    setDetailReloadToken((token) => token + 1);
                  }}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {detailState.kind === 'ready' ? (
            <ExecutionDetail
              getLogs={controllers.getLogs}
              execution={detailState.execution}
              pipelineNames={pipelineNames}
              liveMode={liveMode}
              isCancelling={isCancelling}
              isRerunning={isRerunning}
              onCancel={cancelSelected}
              onRerun={rerunSelected}
            />
          ) : null}
        </Card>
      </div>
    </section>
  );
}
