'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { Badge, type BadgeVariant } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Card } from '@/app/_components/ui/card';
import { InlineError, PageAlert } from '@/app/_components/ui/page-alert';
import { Spinner } from '@/app/_components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { ConflictError } from '@/src/entities/errors/application-errors';
import type {
  DataWorkflowDetail,
  DataWorkflowRun,
  DataWorkflowSchedule,
  DataWorkflowVersion,
} from '@/src/entities/models/data-workflow';
import { fromWorkflowGraphDto } from '@/src/entities/models/data-workflow-graph';
import type {
  DataWorkflowWatchSourceChangeType,
  DataWorkflowWatchSourceTrigger,
} from '@/src/entities/models/data-workflow-watch-source';
import type { DataWorkflowController } from '@/src/interface-adapters/controllers/data-workflow/data-workflow.controller';

interface Props {
  readonly controller: DataWorkflowController;
  readonly workflow: DataWorkflowDetail;
  readonly onWorkflowChanged?: (workflow: DataWorkflowDetail) => void;
}

type BusyAction = 'PAUSE' | 'RUN' | 'RETRY' | undefined;
const HISTORY_PAGE_SIZE = 5;

export function DataWorkflowHistoryPanel({ controller, workflow, onWorkflowChanged }: Props) {
  const [schedule, setSchedule] = useState<DataWorkflowSchedule>();
  const [versions, setVersions] = useState<readonly DataWorkflowVersion[]>();
  const [runs, setRuns] = useState<readonly DataWorkflowRun[]>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState<BusyAction>();
  const [retry, setRetry] = useState<{
    readonly run: DataWorkflowRun;
    readonly nodeId: string;
  }>();
  const [acknowledged, setAcknowledged] = useState(false);
  const triggerNode = workflow.draft.graph.nodes.find((node) => node.type === 'TRIGGER');
  const watchSourceTrigger =
    triggerNode?.type === 'TRIGGER' && triggerNode.trigger.type === 'WATCH_SOURCE'
      ? triggerNode.trigger
      : undefined;

  const load = useCallback(async () => {
    try {
      const [nextSchedule, nextVersions, nextRuns] = await Promise.all([
        controller.getSchedule(workflow.id),
        controller.listVersions(workflow.id),
        controller.listRuns(workflow.id),
      ]);
      setSchedule(nextSchedule);
      setVersions(nextVersions);
      setRuns(nextRuns);
      setError(undefined);
    } catch (cause) {
      setError(messageFor(cause, 'The workflow schedule and history could not be loaded.'));
    }
  }, [controller, workflow.id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const togglePaused = useCallback(async () => {
    if (workflow.triggerKind !== 'WATCH_SOURCE' && schedule?.kind === 'MANUAL') return;
    setBusy('PAUSE');
    setError(undefined);
    try {
      const updated = await controller.setPaused(workflow.id, workflow.revision, !workflow.paused);
      onWorkflowChanged?.(updated);
      setNotice(
        updated.paused
          ? 'Automatic scheduling is paused. Run now remains available.'
          : 'Automatic scheduling has resumed.',
      );
      await load();
      setSchedule((current) =>
        current === undefined || current.kind === 'MANUAL'
          ? current
          : {
              ...current,
              paused: updated.paused,
              enabled: !updated.paused,
              lifecycle: updated.paused ? 'PAUSED' : 'ENABLED',
            },
      );
    } catch (cause) {
      setError(messageFor(cause, 'The automatic schedule could not be updated.'));
    } finally {
      setBusy(undefined);
    }
  }, [
    controller,
    load,
    onWorkflowChanged,
    schedule?.kind,
    workflow.id,
    workflow.paused,
    workflow.revision,
    workflow.triggerKind,
  ]);

  const runNow = useCallback(async () => {
    if (workflow.publishedVersion === undefined) {
      setError('Publish a version before starting this workflow.');
      return;
    }
    setBusy('RUN');
    setError(undefined);
    try {
      await controller.startRun(workflow.id);
      setNotice('The manual run was queued. Refreshing history…');
      await load();
    } catch (cause) {
      setError(
        cause instanceof ConflictError
          ? 'Another run is already active. Wait for it to finish before starting a new one.'
          : messageFor(cause, 'The workflow could not be started.'),
      );
    } finally {
      setBusy(undefined);
    }
  }, [controller, load, workflow.id, workflow.publishedVersion]);

  const retryNode = useCallback(async () => {
    if (retry === undefined || !acknowledged) return;
    setBusy('RETRY');
    setError(undefined);
    try {
      await controller.retryNode({
        workflowId: workflow.id,
        runId: retry.run.id,
        nodeId: retry.nodeId,
        expectedRevision: retry.run.revision,
        acknowledgeWriteRisk: true,
      });
      setNotice(`Retry for ${retry.nodeId} was queued.`);
      setRetry(undefined);
      setAcknowledged(false);
      await load();
    } catch (cause) {
      setError(messageFor(cause, 'The failed node could not be retried.'));
    } finally {
      setBusy(undefined);
    }
  }, [acknowledged, controller, load, retry, workflow.id]);

  return (
    <section
      className="grid gap-4 bg-muted/20 px-4 py-5 sm:px-6"
      aria-label="Workflow schedule and history"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule and run history</h2>
          <p className="text-sm text-muted-foreground">
            Schedule controls affect automatic runs only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workflow.triggerKind === 'WATCH_SOURCE' || schedule?.kind !== 'MANUAL' ? (
            <Button
              variant="outline"
              onClick={() => void togglePaused()}
              disabled={busy !== undefined}
            >
              {busy === 'PAUSE' ? <Spinner className="size-4" /> : null}
              {workflow.paused ? 'Resume automatic schedule' : 'Pause automatic schedule'}
            </Button>
          ) : null}
          <Button
            onClick={() => void runNow()}
            disabled={busy !== undefined || workflow.publishedVersion === undefined}
          >
            {busy === 'RUN' ? <Spinner className="size-4" /> : null}
            Run now
          </Button>
        </div>
      </div>
      {workflow.publishedVersion === undefined ? (
        <p className="text-sm text-muted-foreground">Publish a version to enable Run now.</p>
      ) : null}
      {error ? <InlineError aria-live="assertive">{error}</InlineError> : null}
      {notice ? (
        <PageAlert tone="info" title="Workflow update">
          {notice}
        </PageAlert>
      ) : null}
      {schedule === undefined ? (
        <div className="grid min-h-20 place-items-center">
          <Spinner />
        </div>
      ) : workflow.triggerKind === 'WATCH_SOURCE' && watchSourceTrigger ? (
        <WatchSourceSummary paused={workflow.paused} trigger={watchSourceTrigger} />
      ) : (
        <ScheduleSummary schedule={schedule} />
      )}
      <HistoryTabs
        runs={runs}
        versions={versions}
        onRetry={(run, nodeId) => {
          setRetry({ run, nodeId });
          setAcknowledged(false);
        }}
      />
      {retry ? (
        <Card
          className="grid gap-3 border-status-warning/30 p-4"
          aria-label="Retry acknowledgement"
        >
          <h3 className="font-semibold">Retry {retry.nodeId}</h3>
          <p className="text-sm text-muted-foreground">
            A retry can repeat append writes. Confirm only after checking the target data.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            I understand this retry may repeat append writes.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void retryNode()} disabled={!acknowledged || busy !== undefined}>
              {busy === 'RETRY' ? <Spinner className="size-4" /> : null}
              Acknowledge duplicate-write risk and retry
            </Button>
            <Button
              variant="outline"
              onClick={() => setRetry(undefined)}
              disabled={busy === 'RETRY'}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function HistoryTabs({
  runs,
  versions,
  onRetry,
}: {
  readonly runs?: readonly DataWorkflowRun[];
  readonly versions?: readonly DataWorkflowVersion[];
  readonly onRetry: (run: DataWorkflowRun, nodeId: string) => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Tabs className="gap-0" defaultValue="runs">
        <TabsList className="h-auto w-full rounded-none border-b bg-transparent p-1" variant="line">
          <TabsTrigger className="py-2.5" value="runs">
            Run history
            {runs === undefined ? null : <Badge variant="secondary">{runs.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger className="py-2.5" value="versions">
            Versions
            {versions === undefined ? null : <Badge variant="secondary">{versions.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="p-4" value="runs">
          <RunsHistory runs={runs} versions={versions} onRetry={onRetry} />
        </TabsContent>
        <TabsContent className="p-4" value="versions">
          <VersionsHistory versions={versions} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function VersionsHistory({ versions }: { readonly versions?: readonly DataWorkflowVersion[] }) {
  const [page, setPage] = useState(0);
  const totalPages = pageCount(versions?.length ?? 0);
  const currentPage = Math.min(page, totalPages - 1);
  const visibleVersions = pageItems(versions ?? [], currentPage);

  return versions === undefined ? (
    <Spinner />
  ) : versions.length === 0 ? (
    <p className="text-sm text-muted-foreground">No published versions yet.</p>
  ) : (
    <>
      <ul className="grid gap-2 text-sm">
        {visibleVersions.map((version) => (
          <li
            key={version.id}
            className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-medium">v{version.versionNumber} · immutable snapshot</span>
            <time className="text-xs text-muted-foreground" dateTime={version.publishedAt}>
              {formatTime(version.publishedAt)}
            </time>
          </li>
        ))}
      </ul>
      <HistoryPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

function RunsHistory({
  runs,
  versions,
  onRetry,
}: {
  readonly runs?: readonly DataWorkflowRun[];
  readonly versions?: readonly DataWorkflowVersion[];
  readonly onRetry: (run: DataWorkflowRun, nodeId: string) => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = pageCount(runs?.length ?? 0);
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRuns = pageItems(runs ?? [], currentPage);

  return runs === undefined ? (
    <Spinner />
  ) : runs.length === 0 ? (
    <p className="text-sm text-muted-foreground">No workflow runs yet.</p>
  ) : (
    <>
      <ul className="grid gap-2 text-sm">
        {visibleRuns.map((run) => (
          <RunEntry
            key={run.id}
            run={run}
            version={versions?.find((version) => version.id === run.versionId)}
            onRetry={(nodeId) => onRetry(run, nodeId)}
          />
        ))}
      </ul>
      <HistoryPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

function HistoryPagination({
  page,
  totalPages,
  onPageChange,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="History pages" className="mt-3 flex items-center justify-end gap-2">
      <Button
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        size="sm"
        variant="outline"
      >
        Previous page
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {page + 1} of {totalPages}
      </span>
      <Button
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        size="sm"
        variant="outline"
      >
        Next page
      </Button>
    </nav>
  );
}

function WatchSourceSummary({
  paused,
  trigger,
}: {
  readonly paused: boolean;
  readonly trigger: DataWorkflowWatchSourceTrigger;
}) {
  const relationCount = trigger.relations.length;
  const relationLabel = `${relationCount} ${relationCount === 1 ? 'table' : 'tables'}`;
  const isCdc = trigger.mode === 'CDC';
  return (
    <Card className="grid gap-2 p-4 sm:grid-cols-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">Saved trigger</p>
        <p className="font-medium">Watch Source · {isCdc ? 'CDC' : 'Polling'}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">Coverage</p>
        <p>
          {isCdc
            ? `${formatChangeTypes(trigger.changeTypes)} events`
            : 'INSERT and UPDATE cursor observations'}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {isCdc ? 'Tables and window' : 'Tables and interval'}
        </p>
        <p>
          {relationLabel} ·{' '}
          {isCdc
            ? `${trigger.aggregationWindowSeconds} second window`
            : `every ${trigger.everySeconds} seconds`}
        </p>
      </div>
      <p className="sm:col-span-3 text-sm text-muted-foreground">
        {paused
          ? 'Paused stops automatic delivery while source progress remains intact.'
          : isCdc
            ? 'The first change starts a fixed aggregation window; later changes join without moving the deadline.'
            : 'The source is checked by a connector worker; existing rows are baseline only and hard deletes are not detected.'}
      </p>
    </Card>
  );
}

function formatChangeTypes(changeTypes: readonly DataWorkflowWatchSourceChangeType[]): string {
  if (changeTypes.length < 2) return changeTypes[0] ?? 'No change types';
  return `${changeTypes.slice(0, -1).join(', ')} and ${changeTypes.at(-1)}`;
}

function ScheduleSummary({ schedule }: { readonly schedule: DataWorkflowSchedule }) {
  if (schedule.kind === 'MANUAL') {
    return (
      <PageAlert tone="info" title="Manual workflow">
        This workflow runs only when someone selects Run now.
      </PageAlert>
    );
  }
  return (
    <Card className="grid gap-2 p-4 sm:grid-cols-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">Schedule</p>
        <p className="font-medium">
          {schedule.kind === 'CALENDAR' ? 'Calendar' : 'Interval'} ·{' '}
          {schedule.lifecycle.toLowerCase()}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">Next automatic run</p>
        <p>{schedule.nextDueAt ? formatTime(schedule.nextDueAt) : 'Not scheduled'}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">Coalescing</p>
        <p>
          {schedule.occurrenceCoverage.coalescedCount === 0
            ? 'No due occurrences were coalesced.'
            : `${schedule.occurrenceCoverage.coalescedCount} due occurrences were coalesced.`}
        </p>
      </div>
      {schedule.paused ? (
        <p className="sm:col-span-3 text-sm text-muted-foreground">
          Paused affects automatic scheduling only. Run now remains available.
        </p>
      ) : null}
    </Card>
  );
}

function RunEntry({
  run,
  version,
  onRetry,
}: {
  readonly run: DataWorkflowRun;
  readonly version?: DataWorkflowVersion;
  readonly onRetry: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = runStatusLabel(run);
  return (
    <li className="overflow-hidden rounded-md border bg-background">
      <button
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} run ${run.id}`}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Badge variant={runStatusVariant(run.status)}>{label}</Badge>
        <span className="min-w-0 text-xs text-muted-foreground">
          {run.attempts.length} {run.attempts.length === 1 ? 'attempt' : 'attempts'}
        </span>
        <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={run.updatedAt}>
          {formatTime(run.updatedAt)}
        </time>
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="grid gap-3 border-t bg-muted/20 p-3">
          {run.selectedOutcomeRoutes?.map((route) => {
            const graph = version ? fromWorkflowGraphDto(version.graph) : undefined;
            const targets = graph?.edges
              .filter(
                (edge) => edge.sourceNodeId === route.nodeId && edge.sourcePortId === route.portId,
              )
              .map(
                (edge) => version?.pipelineDisplayNames?.[edge.targetNodeId] ?? 'Downstream node',
              );
            return (
              <p className="text-xs text-muted-foreground" key={`${route.nodeId}-${route.portId}`}>
                {route.portId === 'error' ? 'Error' : 'Success'} route
                {targets?.length ? ` → ${targets.join(', ')}` : ' selected'}
              </p>
            );
          })}
          {run.attempts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No node attempts were recorded.</p>
          ) : (
            <ul className="grid gap-2">
              {run.attempts.map((attempt) => {
                const nodeName = run.nodeDisplayNames?.[attempt.nodeId] ?? attempt.nodeId;
                return (
                  <li
                    className="grid min-w-0 gap-2 rounded-md border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={`${attempt.nodeId}-${attempt.attemptNumber}`}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 break-all font-medium">{nodeName}</span>
                      <span className="text-xs text-muted-foreground">
                        attempt {attempt.attemptNumber}
                      </span>
                      <Badge variant={attemptStatusVariant(attempt.state)}>{attempt.state}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {attempt.executionId ? (
                        <Link
                          className="text-xs font-medium underline underline-offset-4"
                          href={`/executions?executionId=${encodeURIComponent(attempt.executionId)}`}
                          aria-label={`View execution for ${nodeName} attempt ${attempt.attemptNumber}`}
                        >
                          View execution
                        </Link>
                      ) : null}
                      {attempt.state === 'FAILED' ? (
                        <Button
                          aria-label={`Retry failed node ${attempt.nodeId}`}
                          onClick={() => onRetry(attempt.nodeId)}
                          size="sm"
                          variant="outline"
                        >
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function runStatusLabel(run: DataWorkflowRun): string {
  return run.status === 'SUCCEEDED' && run.recoveredFailure
    ? 'Succeeded via Error route'
    : run.status;
}

function runStatusVariant(status: DataWorkflowRun['status']): BadgeVariant {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING') return 'info';
  if (status === 'QUEUED') return 'warning';
  return 'secondary';
}

function attemptStatusVariant(status: DataWorkflowRun['attempts'][number]['state']): BadgeVariant {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING') return 'info';
  return 'secondary';
}

function pageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(itemCount / HISTORY_PAGE_SIZE));
}

function pageItems<T>(items: readonly T[], page: number): readonly T[] {
  const start = page * HISTORY_PAGE_SIZE;
  return items.slice(start, start + HISTORY_PAGE_SIZE);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}
function messageFor(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
