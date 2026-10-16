'use client';

import { ChevronRightIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type { DatabaseServiceViewModel } from '@/src/interface-adapters/presenters/database-service.presenter';
import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';
import type { PipelineSummaryViewModel } from '@/src/interface-adapters/presenters/pipeline.presenter';
import type {
  TableSnapshotViewModel,
  TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { TableRef } from '@/src/entities/models/catalog';
import { ExecutionStatusBadge } from '@/app/_components/execution/execution-status-badge';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Item, ItemContent, ItemTitle } from '@/app/_components/ui/item';
import { Skeleton } from '@/app/_components/ui/skeleton';
import { cn } from '@/app/_components/ui/utils';
import type { Translator } from '@/app/_i18n/translate';
import { useTranslation } from '@/app/_i18n/use-translation';

import { formatRelative, formatRunDuration, formatWrittenAt } from './database-overview-format';
import { isBehindPipeline, readTableProvenance, type TableProvenance } from './table-provenance';

/**
 * How many tables get a provenance line here.
 *
 * Each one costs a snapshot request, and this is a summary — past a handful the
 * Tables tab is the better surface. The rest stay reachable through the link
 * beside the heading rather than being silently dropped.
 */
const PROVENANCE_LIMIT = 6;
const ACTIVITY_LIMIT = 5;

interface DatabaseOverviewProps {
  readonly executions: readonly ExecutionSummaryViewModel[];
  readonly loadSnapshots: (ref: TableRef) => Promise<readonly TableSnapshotViewModel[]>;
  readonly onGoToTab: (tab: string) => void;
  readonly onOpenTable: (ref: TableRef) => void;
  readonly pipelines: readonly PipelineSummaryViewModel[];
  readonly sources: readonly DatabaseServiceViewModel[];
  readonly tables: readonly TableSummaryViewModel[];
}

/**
 * What this database is, before what is in it.
 *
 * Three questions in the order they get asked: is it working, what does it
 * hold, what happened lately. The middle one carries each table's provenance —
 * who wrote it, at which version, when — because "the pipeline ran" and "the
 * table changed" are separate facts, and only the table settles the second.
 */
export function DatabaseOverview({
  executions,
  loadSnapshots,
  onGoToTab,
  onOpenTable,
  pipelines,
  sources,
  tables,
}: DatabaseOverviewProps) {
  const { locale, t } = useTranslation();
  // Kept with the list it was read for, rather than cleared in the effect: a
  // reset there is a render-phase write, and the identity check says the same
  // thing without one. A new `tables` array means the loaded map is stale.
  const [loaded, setLoaded] = useState<{
    readonly tables: readonly TableSummaryViewModel[];
    readonly data: Record<string, TableProvenance | undefined>;
  }>();
  const provenance = loaded?.tables === tables ? loaded.data : undefined;

  const shown = tables.slice(0, PROVENANCE_LIMIT);

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      tables.slice(0, PROVENANCE_LIMIT).map(async (table) => {
        const ref = { catalog: table.catalog, schema: table.schema, table: table.name };
        // A table whose snapshots will not load still lists; it simply carries
        // no provenance line. One unreadable table must not blank the section.
        const snapshots = await loadSnapshots(ref).catch(() => []);
        return [table.name, readTableProvenance(snapshots)] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        setLoaded({ tables, data: Object.fromEntries(entries) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadSnapshots, tables]);

  // Only what is wrong. Counts live on the tab bar; repeating them here would
  // say the same thing twice, and a strip that always has something to report
  // stops being read. Silence is the healthy state.
  const unverified = sources.filter((source) => source.verification.status !== 'succeeded');
  const behind = shown.filter((table) =>
    isBehindPipeline(
      provenance?.[table.name],
      pipelineVersionFor(pipelines, provenance?.[table.name]),
    ),
  );

  const problems: string[] = [];
  if (unverified.length === 1 && unverified[0] !== undefined) {
    problems.push(t('database.overview.sourceUnverified', { name: unverified[0].name }));
  } else if (unverified.length > 1) {
    problems.push(t('database.overview.sourcesUnverified', { count: unverified.length }));
  }
  if (behind.length === 1 && behind[0] !== undefined) {
    problems.push(t('database.overview.tableBehind', { name: behind[0].name }));
  } else if (behind.length > 1) {
    problems.push(t('database.overview.tablesBehind', { count: behind.length }));
  }

  const recent = [...executions]
    .sort((a, b) => (b.finishedAt ?? b.queuedAt).localeCompare(a.finishedAt ?? a.queuedAt))
    .slice(0, ACTIVITY_LIMIT);

  return (
    <div className="grid gap-8">
      {problems.length > 0 || tables.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {problems.length === 0 ? (
            <Fact text={t('database.overview.healthy')} tone="success" />
          ) : (
            problems.map((problem) => <Fact key={problem} text={problem} tone="warning" />)
          )}
        </div>
      ) : null}

      <section className="grid gap-2">
        <Heading
          title={t('database.tab.tables')}
          {...(tables.length > shown.length
            ? {
                action: (
                  <Button onClick={() => onGoToTab('tables')} size="sm" variant="ghost">
                    {t('database.overview.viewAllTables', { count: tables.length })}
                  </Button>
                ),
              }
            : {})}
        />
        {tables.length === 0 ? (
          <Quiet text={t('database.empty.tablesHint')} />
        ) : (
          <div className="divide-y divide-border">
            {shown.map((table) => {
              const where = provenance?.[table.name];
              const version = pipelineVersionFor(pipelines, where);
              return (
                <Item asChild key={table.name} size="sm">
                  <button
                    className="w-full text-left"
                    onClick={() =>
                      onOpenTable({
                        catalog: table.catalog,
                        schema: table.schema,
                        table: table.name,
                      })
                    }
                    type="button"
                  >
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle className="gap-2">
                        <span className="truncate font-mono">{table.name}</span>
                        {isBehindPipeline(where, version) ? (
                          <Badge variant="warning">
                            {t('database.overview.behind', { version: version ?? 0 })}
                          </Badge>
                        ) : null}
                      </ItemTitle>
                      {provenance === undefined ? (
                        <Skeleton className="h-4 w-64" />
                      ) : (
                        <span className="block truncate text-caption text-muted-foreground">
                          {describeTable(where, pipelines, t, locale)}
                        </span>
                      )}
                    </ItemContent>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground"
                      size={17}
                    />
                  </button>
                </Item>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <Heading
          title={t('database.overview.activity')}
          {...(executions.length > 0
            ? {
                action: (
                  <Button onClick={() => onGoToTab('runs')} size="sm" variant="ghost">
                    {t('database.overview.viewAllRuns')}
                  </Button>
                ),
              }
            : {})}
        />
        {recent.length === 0 ? (
          <Quiet text={t('database.overview.noActivityHint')} />
        ) : (
          <div className="divide-y divide-border">
            {recent.map((run) => (
              <Item className="gap-3" key={run.id} size="sm">
                <ExecutionStatusBadge status={run.status} />
                <ItemContent className="min-w-0">
                  <span className="block truncate text-caption text-muted-foreground">
                    {namePipeline(pipelines, run.pipelineId)} · v{run.versionNumber}
                  </span>
                </ItemContent>
                <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                  {formatRunDuration(run)}
                </span>
                <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                  {formatRelative(run.finishedAt ?? run.queuedAt, locale)}
                </span>
              </Item>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * An empty section, said once.
 *
 * `EmptyBlock` is a tinted panel the width of the page — right when the empty
 * thing *is* the screen, too loud for a section that is merely quiet while the
 * sections around it carry content.
 */
function Quiet({ text }: { readonly text: string }) {
  return <p className="m-0 py-2 text-body-sm text-muted-foreground">{text}</p>;
}

function Heading({ action, title }: { readonly action?: ReactNode; readonly title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="m-0 text-body-sm font-semibold">{title}</h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

const FACT_TONES = {
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  muted: 'bg-muted-foreground/40',
} as const;

function Fact({ text, tone }: { readonly text: string; readonly tone: keyof typeof FACT_TONES }) {
  return (
    <span className="flex items-center gap-2 text-body-sm text-muted-foreground">
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', FACT_TONES[tone])} />
      {text}
    </span>
  );
}

/** The current version of whichever pipeline last wrote this table. */
function pipelineVersionFor(
  pipelines: readonly PipelineSummaryViewModel[],
  where: TableProvenance | undefined,
): number | undefined {
  if (where?.pipelineId === undefined) {
    return undefined;
  }
  return pipelines.find((pipeline) => pipeline.id === where.pipelineId)?.version;
}

function namePipeline(
  pipelines: readonly PipelineSummaryViewModel[],
  pipelineId: string | undefined,
): string {
  return pipelines.find((pipeline) => pipeline.id === pipelineId)?.name ?? '—';
}

/** One line of provenance, or the commit time alone when nothing named itself. */
function describeTable(
  where: TableProvenance | undefined,
  pipelines: readonly PipelineSummaryViewModel[],
  t: Translator,
  locale: string,
): string {
  if (where === undefined) {
    return t('database.overview.neverWritten');
  }

  const parts: string[] = [];
  if (where.rows !== undefined) {
    parts.push(t('database.overview.rows', { count: where.rows }));
  }
  parts.push(formatWrittenAt(where.writtenAt, locale));

  const pipeline = pipelines.find((candidate) => candidate.id === where.pipelineId);
  if (pipeline !== undefined && where.pipelineVersion !== undefined) {
    parts.push(
      t('database.overview.writtenBy', { name: pipeline.name, version: where.pipelineVersion }),
    );
  }
  return parts.join(' · ');
}
