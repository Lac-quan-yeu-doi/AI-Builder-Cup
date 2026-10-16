'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isCancellableStatus,
  isTerminalStatus,
  looksReadOnly,
  type SqlExecutionStatus,
} from '@/src/entities/models/query';
import type { CancelQueryController } from '@/src/interface-adapters/controllers/queries/cancel-query.controller';
import type { GetQueryController } from '@/src/interface-adapters/controllers/queries/get-query.controller';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { ListQueryHistoryController } from '@/src/interface-adapters/controllers/queries/list-query-history.controller';
import type { ListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import type { MonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import type { SubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';
import type {
  SqlCatalogViewModel,
  SqlExecutionResultViewModel,
  SqlExecutionSummaryViewModel,
  SqlNamespaceViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';
import { errorMessage } from '@/app/_components/shared/error-message';
import { releaseMonitor } from '@/app/_components/shared/monitor-lifecycle';
import { isCurrentRequestToken } from '@/app/_components/shared/request-token';
import { ExecutionHistory } from './execution-history';
import { QueryFailureView } from './query-failure-view';
import { QueryStatisticsPanel } from './query-statistics-panel';
import { ResultGrid } from './result-grid';
import { StatusBadge } from './status-badge';
import { queryMonitorChannel, type QueryDisplayChannel } from './query-monitor-channel';
import { Button } from '@/app/_components/ui/button';
import { PageBar } from '@/app/_components/ui/page-bar';
import { useTranslation } from '@/app/_i18n/use-translation';
import { cn } from '@/app/_components/ui/utils';
import { Spinner } from '@/app/_components/ui/spinner';
import { Card } from '@/app/_components/ui/card';
import { SelectField } from '@/app/_components/ui/fields';

const editorSurfaceClass = 'h-[280px] bg-editor-canvas sm:h-[340px]';
const selectorClass = 'min-w-0 flex-[1_1_180px]';
const bannerClass =
  'flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 px-[14px] py-[11px] text-body-sm leading-[1.5] text-destructive';
const hintClass =
  'rounded-lg border border-status-warning/40 bg-status-warning-light px-[14px] py-[11px] text-caption leading-[1.5] text-status-warning-dark';
const resultsPlaceholderClass =
  'flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-9 text-center';

const SqlEditor = dynamic(() => import('./sql-editor').then((module) => module.SqlEditor), {
  ssr: false,
  loading: () => (
    <div
      className={cn(
        editorSurfaceClass,
        'grid place-items-center content-center text-caption text-editor-ink-muted',
      )}
      role="status"
      aria-label="Loading SQL editor"
    >
      <Spinner className="size-7 text-primary" />
      <strong>Loading SQL editor…</strong>
    </div>
  ),
});

const STARTER_SQL = 'SELECT 1 AS example';
const ERROR_FALLBACK = 'Check the Core API and try again.';
const DEFAULT_QUERY_CATALOG = 'iceberg';

interface QueryWorkbenchScreenProps {
  readonly controllers: Readonly<{
    listCatalogs: ListQueryCatalogsController;
    listNamespaces: ListQueryNamespacesController;
    listHistory: ListQueryHistoryController;
    get: GetQueryController;
    cancel: CancelQueryController;
    submit: SubmitQueryController;
    monitor: MonitorQueryController;
  }>;
}

interface LiveProgress {
  readonly status: SqlExecutionStatus;
  readonly progressPercentage?: number;
}

export function QueryWorkbenchScreen({ controllers }: QueryWorkbenchScreenProps) {
  const { t } = useTranslation();
  const monitorRef = useRef<ReturnType<MonitorQueryController> | null>(null);
  const viewToken = useRef(0);

  const [catalogs, setCatalogs] = useState<readonly SqlCatalogViewModel[]>();
  const [catalogsError, setCatalogsError] = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState('');

  const [namespaces, setNamespaces] = useState<readonly SqlNamespaceViewModel[]>();
  const [namespacesError, setNamespacesError] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('');

  const [sql, setSql] = useState(STARTER_SQL);

  const [history, setHistory] = useState<readonly SqlExecutionSummaryViewModel[]>();
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  const [execution, setExecution] = useState<SqlExecutionResultViewModel>();
  const [liveProgress, setLiveProgress] = useState<LiveProgress>();
  const [channel, setChannel] = useState<QueryDisplayChannel>();
  const [monitorError, setMonitorError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);

  const closeMonitor = useCallback(() => {
    monitorRef.current = releaseMonitor(monitorRef.current);
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const items = await controllers.listHistory();
      setHistory(items);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [controllers]);

  const loadCatalogs = useCallback(async () => {
    setCatalogs(undefined);
    setCatalogsError(false);
    try {
      const items = await controllers.listCatalogs();
      setCatalogs(items);
      const defaultCatalog =
        items.find((catalog) => catalog.name === DEFAULT_QUERY_CATALOG) ?? items[0];
      setSelectedCatalog((current) => current || (defaultCatalog?.name ?? ''));
    } catch {
      setCatalogsError(true);
    }
  }, [controllers]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await controllers.listCatalogs();
        if (!cancelled) {
          setCatalogs(items);
          const defaultCatalog =
            items.find((catalog) => catalog.name === DEFAULT_QUERY_CATALOG) ?? items[0];
          setSelectedCatalog((current) => current || (defaultCatalog?.name ?? ''));
        }
      } catch {
        if (!cancelled) {
          setCatalogsError(true);
        }
      }
    })();
    void (async () => {
      try {
        const items = await controllers.listHistory();
        if (!cancelled) {
          setHistory(items);
          setHistoryError(false);
        }
      } catch {
        if (!cancelled) {
          setHistoryError(true);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      closeMonitor();
    };
  }, [controllers, closeMonitor]);

  useEffect(() => {
    if (!selectedCatalog) {
      return;
    }
    let cancelled = false;
    controllers
      .listNamespaces(selectedCatalog)
      .then((items) => {
        if (!cancelled) {
          const visibleDatabases = items.filter(
            (namespace) => namespace.name.toLocaleLowerCase() !== 'system',
          );
          setNamespaces(visibleDatabases);
          setSelectedNamespace((current) =>
            visibleDatabases.some((database) => database.name === current)
              ? current
              : (visibleDatabases[0]?.name ?? ''),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNamespacesError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [controllers, selectedCatalog]);

  const attachMonitor = useCallback(
    (id: string, token: number) => {
      monitorRef.current = controllers.monitor(id, {
        onChannel: (next) => {
          if (isCurrentRequestToken(viewToken.current, token)) {
            setChannel(queryMonitorChannel(next));
          }
        },
        onProgress: (event) => {
          if (isCurrentRequestToken(viewToken.current, token)) {
            setLiveProgress({
              status: event.status,
              ...(event.progressPercentage !== undefined
                ? { progressPercentage: event.progressPercentage }
                : {}),
            });
          }
        },
        onSnapshot: (result) => {
          if (!isCurrentRequestToken(viewToken.current, token)) {
            return;
          }
          setExecution(result);
          setLiveProgress({
            status: result.status,
            ...(result.statistics?.progressPercentage !== undefined
              ? { progressPercentage: result.statistics.progressPercentage }
              : {}),
          });
          if (isTerminalStatus(result.status)) {
            void refreshHistory();
          }
        },
        onError: (error) => {
          if (isCurrentRequestToken(viewToken.current, token)) {
            setMonitorError(errorMessage(error, ERROR_FALLBACK));
          }
        },
      });
    },
    [controllers, refreshHistory],
  );

  const beginView = useCallback(() => {
    closeMonitor();
    viewToken.current += 1;
    return viewToken.current;
  }, [closeMonitor]);

  const runQuery = useCallback(async () => {
    if (submitting || !selectedCatalog || sql.trim().length === 0) {
      return;
    }
    const token = beginView();
    setSubmitting(true);
    setSubmitError(undefined);
    setMonitorError(undefined);
    setExecution(undefined);
    setLiveProgress(undefined);
    setChannel(undefined);
    setDetailLoading(false);
    try {
      const accepted = await controllers.submit({
        sql,
        context: {
          catalog: selectedCatalog,
          ...(selectedNamespace ? { namespace: selectedNamespace } : {}),
        },
      });
      if (!isCurrentRequestToken(viewToken.current, token)) {
        return;
      }
      setSelectedId(accepted.id);
      setLiveProgress({ status: accepted.status });
      attachMonitor(accepted.id, token);
      void refreshHistory();
    } catch (error) {
      if (isCurrentRequestToken(viewToken.current, token)) {
        setSubmitError(errorMessage(error, ERROR_FALLBACK));
      }
    } finally {
      if (isCurrentRequestToken(viewToken.current, token)) {
        setSubmitting(false);
      }
    }
  }, [
    submitting,
    selectedCatalog,
    selectedNamespace,
    sql,
    beginView,
    controllers,
    attachMonitor,
    refreshHistory,
  ]);

  const selectExecution = useCallback(
    async (id: string) => {
      if (id === selectedId && execution) {
        return;
      }
      const token = beginView();
      setSelectedId(id);
      setExecution(undefined);
      setLiveProgress(undefined);
      setChannel(undefined);
      setMonitorError(undefined);
      setSubmitError(undefined);
      setDetailLoading(true);
      try {
        const result = await controllers.get(id);
        if (!isCurrentRequestToken(viewToken.current, token)) {
          return;
        }
        setExecution(result);
        setLiveProgress({
          status: result.status,
          ...(result.statistics?.progressPercentage !== undefined
            ? { progressPercentage: result.statistics.progressPercentage }
            : {}),
        });
        if (!isTerminalStatus(result.status)) {
          attachMonitor(id, token);
        }
      } catch (error) {
        if (isCurrentRequestToken(viewToken.current, token)) {
          setMonitorError(errorMessage(error, ERROR_FALLBACK));
        }
      } finally {
        if (isCurrentRequestToken(viewToken.current, token)) {
          setDetailLoading(false);
        }
      }
    },
    [selectedId, execution, beginView, controllers, attachMonitor],
  );

  const cancelQuery = useCallback(async () => {
    if (!execution || cancelling) {
      return;
    }
    setCancelling(true);
    try {
      const result = await controllers.cancel(execution.id);
      setExecution(result);
      setLiveProgress({
        status: result.status,
        ...(result.statistics?.progressPercentage !== undefined
          ? { progressPercentage: result.statistics.progressPercentage }
          : {}),
      });
      void refreshHistory();
    } catch (error) {
      setMonitorError(errorMessage(error, ERROR_FALLBACK));
    } finally {
      setCancelling(false);
    }
  }, [execution, cancelling, controllers, refreshHistory]);

  const namespacesLoading =
    Boolean(selectedCatalog) && namespaces === undefined && !namespacesError;
  const displayStatus = liveProgress?.status ?? execution?.status;
  const displayProgress =
    liveProgress?.progressPercentage ?? execution?.statistics?.progressPercentage;
  const isRunning = displayStatus ? !isTerminalStatus(displayStatus) : false;
  const canCancel =
    Boolean(execution) && displayStatus !== undefined && isCancellableStatus(displayStatus);
  const readOnlyWarning = sql.trim().length > 0 && !looksReadOnly(sql);
  const catalogsReady = Boolean(catalogs) && !catalogsError;
  const runDisabled = submitting || !catalogsReady || !selectedCatalog || sql.trim().length === 0;

  return (
    <section className="grid gap-5">
      <PageBar description={t('page.sql.description')} title={t('page.sql.title')} />

      <div className="grid min-w-0 grid-cols-1 items-start gap-[18px] min-[901px]:grid-cols-[240px_minmax(0,1fr)] min-[1081px]:grid-cols-[288px_minmax(0,1fr)]">
        <ExecutionHistory
          history={history}
          loading={historyLoading}
          error={historyError}
          selectedId={selectedId}
          disabled={submitting}
          onSelect={(id) => void selectExecution(id)}
          onRetry={() => {
            setHistoryLoading(true);
            void refreshHistory();
          }}
        />

        <Card className="grid gap-4 p-5" asChild>
          <main aria-label="SQL workbench">
            <div className="flex flex-col items-stretch gap-[14px] sm:flex-row sm:flex-wrap sm:items-end">
              <SelectField
                className={selectorClass}
                data={[
                  ...(namespacesLoading || namespacesError || namespaces?.length === 0
                    ? [
                        {
                          label: namespacesLoading
                            ? 'Loading…'
                            : namespacesError
                              ? 'Unavailable'
                              : 'No databases',
                          value: '',
                        },
                      ]
                    : []),
                  ...(namespaces ?? []).map((namespace) => ({
                    label: namespace.name,
                    value: namespace.name,
                  })),
                ]}
                disabled={
                  !selectedCatalog ||
                  namespacesLoading ||
                  namespacesError ||
                  namespaces?.length === 0
                }
                label="Database"
                onChange={setSelectedNamespace}
                value={selectedNamespace}
              />

              <div className="grid grid-cols-1 items-center gap-2 sm:ml-auto sm:flex">
                {canCancel ? (
                  <Button
                    className="max-[620px]:w-full"
                    variant="outline"
                    disabled={cancelling}
                    onClick={() => void cancelQuery()}
                  >
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                  </Button>
                ) : null}
                <Button
                  className="max-[620px]:w-full"
                  data-tutorial-target="run-query"
                  disabled={runDisabled}
                  onClick={() => void runQuery()}
                >
                  {submitting ? 'Submitting…' : 'Run query'}
                </Button>
              </div>
            </div>

            {catalogsError ? (
              <div className={bannerClass} role="alert">
                <span>
                  Query context could not be loaded. Confirm the Core API is running, then retry.
                </span>
                <Button size="sm" variant="outline" onClick={() => void loadCatalogs()}>
                  Retry
                </Button>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex min-h-[46px] items-baseline justify-between gap-3 bg-editor-chrome px-4 py-[10px] text-editor-ink">
                <span className="text-caption font-[750]">SQL statement</span>
                <small className="text-micro text-muted-foreground">
                  Read-only statements only
                </small>
              </div>
              <SqlEditor modelKey="sql" value={sql} disabled={submitting} onChange={setSql} />
            </div>

            {readOnlyWarning ? (
              <div className={hintClass} role="status">
                This does not look like a read-only statement. Only SELECT, WITH, SHOW, DESCRIBE,
                and EXPLAIN style queries are accepted. The Core API makes the final decision.
              </div>
            ) : null}

            {submitError ? (
              <div className={bannerClass} role="alert">
                <span>{submitError}</span>
              </div>
            ) : null}

            {displayStatus ? (
              <div className="flex flex-wrap items-center gap-[10px] rounded-lg border border-border bg-card px-[14px] py-3">
                <StatusBadge status={displayStatus} />
                {isRunning && channel ? (
                  <span className="rounded-full bg-accent px-2 py-[3px] text-micro font-[750] text-primary">
                    {channel === 'sse' ? 'Streaming updates' : 'Polling for updates'}
                  </span>
                ) : null}
                {displayProgress !== undefined ? (
                  <span className="text-caption font-[750] text-foreground">
                    {Math.round(Math.min(100, Math.max(0, displayProgress)))}%
                  </span>
                ) : null}
                {execution?.trinoQueryId ? (
                  <span
                    className="max-w-full overflow-hidden font-mono text-micro text-ellipsis whitespace-nowrap text-muted-foreground sm:ml-auto sm:max-w-[320px]"
                    title="Trino query identifier"
                  >
                    {execution.trinoQueryId}
                  </span>
                ) : null}
              </div>
            ) : null}

            {monitorError ? (
              <div className={hintClass} role="status">
                Live updates were interrupted ({monitorError}). The latest known state is shown
                above.
              </div>
            ) : null}

            <div
              className="grid gap-4"
              aria-live="polite"
              data-tutorial-target={execution?.status === 'succeeded' ? 'query-results' : undefined}
            >
              {detailLoading ? (
                <div className={resultsPlaceholderClass} role="status">
                  <Spinner className="size-7 text-primary" />
                  <strong className="text-body-md">Loading execution…</strong>
                </div>
              ) : execution ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="mb-[6px] block text-micro font-semibold tracking-[0.05em] text-primary uppercase">
                        {execution.namespace
                          ? `${execution.catalog}.${execution.namespace}`
                          : execution.catalog}
                      </span>
                      <code className="block font-mono text-caption leading-[1.5] wrap-anywhere text-foreground">
                        {execution.sql}
                      </code>
                    </div>
                  </div>
                  {execution.failure ? (
                    <QueryFailureView failure={execution.failure} />
                  ) : (
                    <ResultGrid
                      columns={execution.columns}
                      rows={execution.rows}
                      truncated={execution.truncated}
                      resultsAvailable={execution.resultsAvailable}
                      {...(execution.rowCount !== undefined
                        ? { rowCount: execution.rowCount }
                        : {})}
                    />
                  )}
                  <QueryStatisticsPanel
                    {...(execution.statistics ? { statistics: execution.statistics } : {})}
                  />
                </>
              ) : (
                <div className={resultsPlaceholderClass}>
                  <span
                    className="mb-[14px] grid size-12 place-items-center rounded-xl bg-accent font-mono text-caption font-[850] text-primary"
                    aria-hidden="true"
                  >
                    SQL
                  </span>
                  <strong className="text-body-md">Run a statement to see results</strong>
                  <p className="mt-2 max-w-[420px] text-body-sm leading-[1.6] text-muted-foreground">
                    Submitted queries execute asynchronously. Status, statistics, and capped rows
                    appear here as Trino makes progress.
                  </p>
                </div>
              )}
            </div>
          </main>
        </Card>
      </div>
    </section>
  );
}
