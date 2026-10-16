'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/app/_i18n/use-translation';

import {
  describeFailure,
  executionStatusLabel,
  isCancellableExecution,
  isTerminalExecution,
} from '@/src/entities/models/execution';
import type { GetExecutionLogsController } from '@/src/interface-adapters/controllers/executions/get-execution-logs.controller';
import type { ExecutionDetailViewModel } from '@/src/interface-adapters/presenters/execution.presenter';
import { formatDuration, formatTimestamp, shortIdentifier } from './execution-format';
import { ExecutionLogs } from './execution-logs';
import { ExecutionStatusBadge } from './execution-status-badge';
import type { LiveProgressMode } from './use-execution-live-progress';
import { cn } from '@/app/_components/ui/utils';

const actionButtonClass =
  'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-md border border-transparent px-[14px] py-2 text-caption font-semibold transition-[background,border-color,transform] duration-150 ease-[ease] disabled:cursor-wait disabled:opacity-60 not-disabled:hover:-translate-y-px max-[760px]:flex-1';
const tabClass =
  'min-h-[32px] cursor-pointer rounded-sm border-0 bg-transparent px-[14px] py-[6px] text-caption font-semibold text-muted-foreground';
const tabActiveClass = 'bg-card text-primary shadow-100';
const metaLabelClass =
  'mb-1 text-micro font-[750] tracking-[0.06em] text-muted-foreground uppercase';
const metaValueClass = 'm-0 text-body-sm wrap-anywhere text-foreground';
const metaMonoClass = 'font-mono text-caption';

type DetailTab = 'overview' | 'logs';

interface ExecutionDetailProps {
  readonly getLogs: GetExecutionLogsController;
  readonly execution: ExecutionDetailViewModel;
  readonly pipelineNames: Readonly<Record<string, string>>;
  readonly liveMode: LiveProgressMode;
  readonly isCancelling: boolean;
  readonly isRerunning: boolean;
  readonly onCancel: () => void;
  readonly onRerun: () => void;
}

export function ExecutionDetail({
  getLogs,
  execution,
  pipelineNames,
  liveMode,
  isCancelling,
  isRerunning,
  onCancel,
  onRerun,
}: ExecutionDetailProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DetailTab>('overview');

  const canCancel = isCancellableExecution(execution.status);
  const canRerun = isTerminalExecution(execution.status) && execution.workloadKind === 'SCRIPT';
  const failure = describeFailure(execution.errorSummary);
  const isLive = liveMode !== 'idle';
  const duration = formatDuration(execution.startedAt, execution.finishedAt);
  const pipelineName = execution.pipelineId ? pipelineNames[execution.pipelineId] : undefined;

  return (
    <div>
      <header className="flex flex-col items-start justify-between gap-[18px] border-b border-border px-6 py-[22px] md:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-[10px]">
            <h2 className="m-0 font-mono text-body-md font-semibold" title={execution.id}>
              {shortIdentifier(execution.id)}
            </h2>
            <ExecutionStatusBadge status={execution.status} />
          </div>
          <p className="mt-2 flex items-center gap-2 text-caption text-muted-foreground">
            <span>{executionStatusLabel(execution.status)}</span>
            {isLive ? (
              <span className="inline-flex items-center gap-[5px] text-micro font-[750] tracking-[0.04em] text-primary uppercase">
                <span
                  className="size-[7px] animate-status-pulse rounded-full bg-primary"
                  aria-hidden="true"
                />
                {liveMode === 'streaming' ? 'Live' : 'Polling'}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex w-full flex-none items-center gap-2 md:w-auto">
          <button
            type="button"
            className={cn(
              actionButtonClass,
              'border-destructive/30 bg-card text-destructive not-disabled:hover:border-destructive/40 not-disabled:hover:bg-destructive/10',
            )}
            onClick={onCancel}
            disabled={!canCancel || isCancelling}
          >
            {isCancelling ? 'Cancelling…' : 'Cancel'}
          </button>
          <button
            type="button"
            className={cn(
              actionButtonClass,
              'bg-primary text-primary-foreground shadow-200 not-disabled:hover:bg-primary/90',
            )}
            onClick={onRerun}
            disabled={!canRerun || isRerunning}
          >
            {isRerunning ? 'Rerunning…' : 'Rerun version'}
          </button>
        </div>
      </header>

      <div className="grid gap-[22px] px-6 py-[22px]">
        <div
          className="inline-flex gap-1 rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Execution views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overview'}
            className={cn(tabClass, tab === 'overview' && tabActiveClass)}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'logs'}
            className={cn(tabClass, tab === 'logs' && tabActiveClass)}
            onClick={() => setTab('logs')}
          >
            Logs
          </button>
        </div>

        {tab === 'overview' ? (
          <>
            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1081px]:grid-cols-3">
              {[
                ...(execution.executionPrincipal
                  ? [
                      {
                        label: t('executions.runsAs'),
                        value: t(
                          execution.executionPrincipal === 'BACKGROUND'
                            ? 'administration.backgroundExecutor'
                            : 'executions.requestingIdentity',
                        ),
                        mono: false,
                      },
                    ]
                  : []),
                {
                  label: execution.workloadKind === 'PIPELINE' ? 'Pipeline' : 'Script',
                  value:
                    pipelineName ??
                    shortIdentifier(execution.pipelineId ?? execution.scriptId ?? ''),
                  mono: pipelineName === undefined,
                  title: execution.pipelineId ?? execution.scriptId,
                },
                {
                  label: 'Version',
                  value: `v${execution.versionNumber}`,
                  mono: true,
                  title: execution.pipelineVersionId ?? execution.scriptVersionId,
                },
                {
                  label: 'Connection',
                  value: execution.connectionId
                    ? shortIdentifier(execution.connectionId)
                    : 'Data Catalog',
                  mono: true,
                  title: execution.connectionId,
                },
                {
                  label: 'Spark application',
                  value: execution.sparkApplicationId ?? 'Not assigned',
                  mono: true,
                },
                {
                  label: 'Exit code',
                  value: execution.exitCode !== undefined ? String(execution.exitCode) : '—',
                  mono: true,
                },
                { label: 'Duration', value: duration ?? '—' },
                { label: 'Queued', value: formatTimestamp(execution.queuedAt) },
                { label: 'Started', value: formatTimestamp(execution.startedAt) },
                {
                  label: execution.cancelledAt ? 'Cancelled' : 'Finished',
                  value: formatTimestamp(execution.cancelledAt ?? execution.finishedAt),
                },
              ].map((entry) => (
                <div className="min-w-0" key={entry.label}>
                  <dt className={metaLabelClass}>{entry.label}</dt>
                  <dd
                    className={cn(metaValueClass, entry.mono && metaMonoClass)}
                    {...(entry.title ? { title: entry.title } : {})}
                  >
                    {entry.value}
                  </dd>
                </div>
              ))}
            </dl>

            {execution.resourceProfile ? (
              <section className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-body-lg font-medium">Resource profile</h3>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-3 border-y border-border py-[14px] min-[1081px]:grid-cols-4">
                  {[
                    { label: 'Driver memory', value: execution.resourceProfile.driverMemory },
                    { label: 'Executor memory', value: execution.resourceProfile.executorMemory },
                    { label: 'Executor cores', value: execution.resourceProfile.executorCores },
                    { label: 'Max cores', value: execution.resourceProfile.maxCores },
                  ].map((entry) => (
                    <div key={entry.label}>
                      <dt className="mb-1 text-micro font-[750] tracking-[0.05em] text-muted-foreground uppercase">
                        {entry.label}
                      </dt>
                      <dd className="m-0 font-mono text-body-sm font-[650] text-foreground">
                        {entry.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {failure ? (
              <section
                className="grid gap-[10px] rounded-xl border border-destructive/30 bg-destructive/10 p-4"
                role="alert"
                aria-label="Failure summary"
              >
                <span className="flex items-center gap-2 text-caption font-semibold tracking-[0.06em] text-destructive uppercase">
                  Failure summary
                </span>
                <p className="m-0 text-body-sm leading-[1.5] font-semibold wrap-anywhere text-destructive">
                  {failure.headline}
                </p>
                {execution.errorSummary?.includes('SOURCE_ACCESS_DENIED') ? (
                  <Link className="text-sm underline" href="/administration?tab=catalog-access">
                    {t('executions.manageCatalogAccess')}
                  </Link>
                ) : null}
                {failure.detail ? (
                  <pre className="m-0 max-h-[260px] overflow-auto rounded-lg bg-editor-canvas p-3 font-mono text-caption leading-[1.55] whitespace-pre-wrap wrap-anywhere text-destructive">
                    {failure.detail}
                  </pre>
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          <ExecutionLogs getLogs={getLogs} executionId={execution.id} />
        )}
      </div>
    </div>
  );
}
