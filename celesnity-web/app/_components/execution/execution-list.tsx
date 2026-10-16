'use client';

import type { ExecutionSummaryViewModel } from '@/src/interface-adapters/presenters/execution.presenter';
import { Item, ItemContent } from '@/app/_components/ui/item';
import { cn } from '@/app/_components/ui/utils';
import { useTranslation } from '@/app/_i18n/use-translation';

import { executionAt, groupExecutionsByDay, relativeDay } from './execution-grouping';
import { formatDuration, shortIdentifier } from './execution-format';
import { ExecutionStatusBadge } from './execution-status-badge';

interface ExecutionListProps {
  readonly executions: readonly ExecutionSummaryViewModel[];
  readonly pipelineNames: Readonly<Record<string, string>>;
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}

/**
 * Every run, densely.
 *
 * Each row used to be a card carrying six label/value pairs, three of which
 * were near-identical timestamps — `QUEUED`, `STARTED` and `FINISHED` inside
 * the same minute — and one a bare connection UUID. Duration, the number the
 * list is actually scanned for, was not there at all.
 *
 * What survives per row is what distinguishes one run from the next: outcome,
 * what ran, how long it took, and when. The identifiers are in the detail
 * beside it, one click away, where they are being read rather than scanned.
 */
export function ExecutionList({
  executions,
  pipelineNames,
  selectedId,
  onSelect,
}: ExecutionListProps) {
  const { locale, t } = useTranslation();
  const days = groupExecutionsByDay(executions);

  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });

  return (
    <div aria-label={t('executions.listLabel')} className="grid">
      {days.map((day) => {
        const named = relativeDay(day.key);
        return (
          <section key={day.key}>
            <h3 className="m-0 flex items-baseline gap-2 px-1 pt-4 pb-1.5 text-caption text-muted-foreground first:pt-0">
              {named === undefined
                ? date.format(new Date(`${day.key}T00:00:00`))
                : t(named === 'today' ? 'executions.today' : 'executions.yesterday')}
              <span className="tabular-nums">{day.runs.length}</span>
            </h3>

            <div className="divide-y divide-border">
              {day.runs.map((run) => {
                const name =
                  (run.pipelineId ? pipelineNames[run.pipelineId] : undefined) ??
                  shortIdentifier(run.pipelineId ?? run.scriptId ?? run.id);
                return (
                  <Item
                    asChild
                    className={cn('flex-nowrap gap-3', run.id === selectedId && 'bg-accent')}
                    key={run.id}
                    size="sm"
                  >
                    <button
                      aria-current={run.id === selectedId ? 'true' : undefined}
                      className="w-full text-left"
                      onClick={() => onSelect(run.id)}
                      type="button"
                    >
                      <ExecutionStatusBadge status={run.status} />
                      {/* A plain span, not `ItemDescription`: that one is
                       * `line-clamp-2`, which keeps a second line alive and
                       * beats `truncate`, so a long identifier broke the row
                       * onto two lines. This is one line by design.
                       *
                       * The run id is the tooltip rather than the text — it was
                       * the widest and least scannable thing on the card this
                       * replaced, but an operator still has to be able to quote
                       * one. On the button it became the row's accessible name,
                       * so a screen reader read out a UUID instead of the run. */}
                      <ItemContent className="min-w-0">
                        <span
                          className="block truncate text-caption text-muted-foreground"
                          title={run.id}
                        >
                          {/* A script run carries no pipeline version, and
                           * `· v` with nothing after it reads as a bug. */}
                          {run.versionNumber === undefined
                            ? name
                            : `${name} · v${run.versionNumber}`}
                        </span>
                      </ItemContent>
                      <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                        {formatDuration(run.startedAt, run.finishedAt) ?? '—'}
                      </span>
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
                        {clock.format(new Date(executionAt(run)))}
                      </span>
                    </button>
                  </Item>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
