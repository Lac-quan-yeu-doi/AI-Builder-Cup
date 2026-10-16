/* Hallmark · component: chart-edit-modal · genre: modern-minimal/technical · theme: shadcn/ui neutral
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass via existing workspace tokens
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChartView } from '@/app/_components/shared/chart-view';
import { Button } from '@/app/_components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/app/_components/ui/collapsible';
import { cn } from '@/app/_components/ui/utils';
import { ArrowLeftIcon, ChartIcon, ChevronDownIcon } from '@/app/_components/ui/icons';
import { FileInput } from '@/app/_components/ui/file-input';
import { IconButton } from '@/app/_components/ui/icon-button';
import { Spinner } from '@/app/_components/ui/spinner';
import { SelectField, TextField, TextareaField } from '@/app/_components/ui/fields';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import { useTranslation } from '@/app/_i18n/use-translation';
import type { Translator } from '@/app/_i18n/translate';
import { useCurrentUserId } from '@/app/_providers/current-user-provider';
import type { CreateChartController } from '@/src/interface-adapters/controllers/charts/create-chart.controller';
import type { DeleteChartController } from '@/src/interface-adapters/controllers/charts/delete-chart.controller';
import type { PatchChartController } from '@/src/interface-adapters/controllers/charts/patch-chart.controller';
import type { SetChartDataFromCsvController } from '@/src/interface-adapters/controllers/charts/set-chart-data-from-csv.controller';
import type { ChartViewModel } from '@/src/interface-adapters/presenters/chart.presenter';
import {
  recommendChartTypes,
  type ChartChannel,
  type ChartType,
} from '@/src/entities/models/chart';
import type { ListChartsController } from '@/src/interface-adapters/controllers/charts/list-charts.controller';
import type {
  SubscribeChartsController,
  SubscribeChartsControllerHandlers,
} from '@/src/interface-adapters/controllers/charts/subscribe-charts.controller';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { MonitorQueryController } from '@/src/interface-adapters/controllers/queries/monitor-query.controller';
import type { SubmitQueryController } from '@/src/interface-adapters/controllers/queries/submit-query.controller';
import type { SuggestChartEncodingsController } from '@/src/interface-adapters/controllers/charts/suggest-chart-encodings.controller';
import { chartEncodingsToView } from '@/src/interface-adapters/presenters/chart-encodings-to-view';
import { isTerminalStatus } from '@/src/entities/models/query';
import type { SqlExecutionResultViewModel } from '@/src/interface-adapters/presenters/query.presenter';

import { chartExportRootAttribute, exportChart, type ChartExportFormat } from './chart-export';
import { QueryFailureView } from '../../sql/_components/query-failure-view';
import { ResultGrid } from '../../sql/_components/result-grid';

const SqlEditor = dynamic(
  () => import('../../sql/_components/sql-editor').then((module) => module.SqlEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className={cn(
          'h-[200px] bg-editor-canvas',
          'grid place-items-center content-center text-caption text-editor-ink-muted',
        )}
        role="status"
        aria-label="Loading SQL editor"
      >
        <Spinner />
      </div>
    ),
  },
);

export interface ChartSidebarProps {
  readonly listCharts: ListChartsController;
  readonly subscribeCharts: SubscribeChartsController;
  readonly createChart: CreateChartController;
  readonly patchChart: PatchChartController;
  readonly deleteChart: DeleteChartController;
  readonly setChartDataFromCsv: SetChartDataFromCsvController;
  /**
   * Powers the edit modal's "Query" section (editable SQL, Refresh, and a
   * result preview). Omit any of the three to hide that section entirely —
   * the rest of the modal still works without it.
   */
  readonly submitQuery?: SubmitQueryController;
  readonly monitorQuery?: MonitorQueryController;
  readonly listQueryCatalogs?: ListQueryCatalogsController;
  /**
   * Silently asks the agent to decide chart_type/encodings after a Refresh
   * repopulates data — no visible chat message, no UI while it runs. Omit to
   * disable (Refresh still updates data/sql, just leaves encodings alone).
   */
  readonly suggestChartEncodings?: SuggestChartEncodingsController;
  /** Opens the run inspector for a chart's provenance. Omit to hide the "Generated from run" link. */
  readonly onInspectRun?: (runId: string) => void;
  /**
   * Drills into a chart's detail view from outside this component — e.g. a
   * citation bubble in the transcript. `nonce` is bumped on every request
   * (even re-clicking the same citation) so the render-time check below
   * re-applies it instead of being skipped as an unchanged dependency.
   */
  readonly focusChartRequest?: { readonly chartId: string; readonly nonce: number } | null;
  /**
   * Attaches a chart as manual context for the next chat message — AIP's
   * "paste a resource into the chat" pattern, the other direction from the
   * agent's own citations. Omit to hide the affordance entirely.
   */
  readonly onAttachChart?: (chart: { readonly id: string; readonly title: string }) => void;
}

interface Draft {
  readonly title: string;
  readonly chartType: ChartType;
  readonly encodings: ChartViewModel['encodings'];
  readonly config: ChartViewModel['config'];
  readonly sql: string | null;
}

const chartTypes: readonly ChartType[] = ['bar', 'line', 'area', 'point', 'pie', 'arc', 'scatter'];
const channels: readonly {
  key: ChartChannel;
  labelKey: 'chart.xAxis' | 'chart.yAxis' | 'chart.color';
}[] = [
  { key: 'x', labelKey: 'chart.xAxis' },
  { key: 'y', labelKey: 'chart.yAxis' },
  { key: 'color', labelKey: 'chart.color' },
];

function toDraft(chart: ChartViewModel): Draft {
  return {
    title: chart.title,
    chartType: chart.chartType,
    encodings: chart.encodings,
    config: chart.config,
    sql: chart.sql,
  };
}

export function ChartSidebar(props: ChartSidebarProps) {
  const { t } = useTranslation();
  const userId = useCurrentUserId();
  const {
    listCharts,
    subscribeCharts,
    createChart,
    patchChart,
    deleteChart,
    setChartDataFromCsv,
    submitQuery,
    monitorQuery,
    listQueryCatalogs,
    suggestChartEncodings,
    onInspectRun,
    focusChartRequest,
    onAttachChart,
  } = props;
  const [open, setOpen] = useState(true);
  const [charts, setCharts] = useState<readonly ChartViewModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'conflict'>('saved');
  const [error, setError] = useState<string | null>(null);
  // `null` closed; a string is the query being drafted for a new chart.
  const [newChartSql, setNewChartSql] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // The chart whose query is being run right now, if any — the only time a
  // spinner is honest.
  const [filling, setFilling] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  const selected = charts.find((chart) => chart.id === selectedId) ?? null;
  const editingChart = charts.find((chart) => chart.id === editingId) ?? null;
  const selectedRunId = selected?.runId ?? null;
  const handleInspectRun = () => {
    if (selectedRunId) onInspectRun?.(selectedRunId);
  };
  const provenanceLabel =
    selectedRunId && onInspectRun ? t('chart.provenance', { runId: selectedRunId }) : null;

  const applyChart = useCallback((chart: ChartViewModel) => {
    setCharts((previous) => {
      const index = previous.findIndex((item) => item.id === chart.id);
      if (index === -1) return [...previous, chart];
      const existing = previous[index];
      if (existing && existing.version > chart.version) return previous;
      const next = [...previous];
      next[index] = chart;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const initial = mergeCharts([], await listCharts());
        if (!cancelled) {
          setCharts(initial);
          setSelectedId((current) =>
            current && initial.some((chart) => chart.id === current) ? current : null,
          );
        }
      } catch {
        if (!cancelled) setError(t('state.error'));
      }
    };
    const handlers: SubscribeChartsControllerHandlers = {
      onChart: (chart) => {
        if (cancelled) return;
        applyChart(chart);
      },
      onDeleted: (chartId) => {
        setCharts((previous) => previous.filter((chart) => chart.id !== chartId));
        setSelectedId((current) => (current === chartId ? null : current));
      },
      onError: () => undefined,
    };
    void load();
    subscriptionRef.current = subscribeCharts(handlers);
    return () => {
      cancelled = true;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      setCharts([]);
      setSelectedId(null);
      setEditingId(null);
      setDraft(null);
      setDirty(false);
    };
  }, [applyChart, listCharts, subscribeCharts, t]);

  // Adjusting state from a prop change belongs during render, not inside an
  // effect (react-hooks/set-state-in-effect) — this is React's own
  // documented pattern for it. `lastFocusNonce` tracks which request this
  // component has already applied so it fires exactly once per request,
  // including a second click on the very same chart (a fresh nonce). Drills
  // straight into that chart's detail view — the list this used to scroll
  // within is hidden once anything is selected, so there's nothing to
  // scroll to any more.
  const [lastFocusNonce, setLastFocusNonce] = useState<number | null>(null);
  if (
    focusChartRequest &&
    focusChartRequest.nonce !== lastFocusNonce &&
    charts.some((chart) => chart.id === focusChartRequest.chartId)
  ) {
    setLastFocusNonce(focusChartRequest.nonce);
    setSelectedId(focusChartRequest.chartId);
    setDirty(false);
    setSaveState('saved');
  }

  useEffect(() => {
    if (!selected || dirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizes the editor draft after selecting a canonical chart
    setDraft(toDraft(selected));
  }, [dirty, selected]);

  useEffect(() => {
    if (!dirty || !draft || !selected) return;
    const timer = setTimeout(() => {
      setSaveState('saving');
      void patchChart({
        id: selected.id,
        expectedVersion: selected.version,
        patch: draft,
      })
        .then((saved) => {
          applyChart(saved);
          setDirty(false);
          setSaveState('saved');
        })
        .catch((reason: unknown) => {
          if (reason instanceof Error && reason.name === 'ConflictError') setSaveState('conflict');
          else setError(reason instanceof Error ? reason.message : t('state.error'));
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [applyChart, dirty, draft, patchChart, selected, t]);

  /**
   * A chart carries the query it was drawn from, so creating one starts with
   * that query rather than with an empty draft: Core refuses a chart without
   * `sql`, and the agent's own `create_chart` tool requires it too.
   */
  /**
   * Runs a new chart's query and lands the result on it: rows first, then the
   * encodings inferred from those rows. Not awaited by the caller — the chart
   * already exists and is listed by then; this is what turns it from a draft
   * into something drawn.
   */
  const fillFromQuery = async (chart: ChartViewModel, sql: string): Promise<void> => {
    if (!submitQuery || !monitorQuery || !listQueryCatalogs) return;
    setFilling(chart.id);
    try {
      const catalogs = await listQueryCatalogs();
      const catalog = catalogs[0]?.name;
      if (catalog === undefined) return;

      const { records, columns } = await runQueryToCompletion(
        sql,
        catalog,
        submitQuery,
        monitorQuery,
      );
      const withData = await patchChart({
        id: chart.id,
        expectedVersion: chart.version,
        patch: { data: records },
      });
      applyChart(withData);

      if (!suggestChartEncodings || records.length === 0) return;
      const suggestion = await suggestChartEncodings({
        userId,
        title: withData.title,
        chartType: withData.chartType,
        columns,
        sampleRows: records.slice(0, 5),
      });
      applyChart(
        await patchChart({
          id: withData.id,
          expectedVersion: withData.version,
          patch: { chartType: suggestion.chartType, encodings: suggestion.encodings },
        }),
      );
    } catch (reason) {
      // The chart survives as a draft; the editor's own Refresh is the retry.
      setError(reason instanceof Error ? reason.message : t('state.error'));
    } finally {
      setFilling(null);
    }
  };

  const startNew = async (sql: string) => {
    try {
      const created = await createChart({
        title: t('chart.new'),
        chartType: 'bar',
        sql,
        encodings: {},
        data: [],
        config: { legend: true },
      });

      // A chart is only `ready` once it holds both rows and an encoding, so
      // creating one has to run its query — otherwise it sits in `draft`
      // forever and the person who just supplied a query is left looking at
      // an empty card wondering what else it wants.
      void fillFromQuery(created, sql);
      applyChart(created);
      setSelectedId(created.id);
      setEditingId(created.id);
      setDraft(toDraft(created));
      setDirty(false);
      setSaveState('saved');
      setError(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('state.error'));
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    try {
      await deleteChart({
        id: selected.id,
        expectedVersion: selected.version,
      });
      setCharts((previous) => previous.filter((chart) => chart.id !== selected.id));
      setSelectedId(null);
      setEditingId(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('state.error'));
    }
  };

  /**
   * "Retry" for a failed chart: resubmits the currently saved fields
   * unchanged, prompting the backend to re-attempt `vlSpec` derivation.
   * Not a true "regenerate from source" — no backend action for that
   * exists yet — but exercises the same recompute path a normal save does.
   */
  const retrySelected = async () => {
    if (!selected) return;
    setRetrying(true);
    try {
      const saved = await patchChart({
        id: selected.id,
        expectedVersion: selected.version,
        patch: {
          title: selected.title,
          chartType: selected.chartType,
          encodings: selected.encodings,
          data: selected.data,
          config: selected.config,
        },
      });
      applyChart(saved);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('state.error'));
    } finally {
      setRetrying(false);
    }
  };

  const openEditor = (chart: ChartViewModel) => {
    setSelectedId(chart.id);
    setEditingId(chart.id);
    setDraft(toDraft(chart));
    setDirty(false);
    setSaveState('saved');
    setError(null);
  };

  const fields = useMemo(() => {
    const keys = new Set<string>();
    for (const row of selected?.data ?? []) Object.keys(row).forEach((key) => keys.add(key));
    return [...keys].sort();
  }, [selected]);

  const changeDraft = (change: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...change } : current));
    setDirty(true);
    setSaveState('saving');
  };

  const changeChannel = (channel: ChartChannel, field: string) => {
    if (!draft) return;
    const encodings = { ...draft.encodings };
    if (!field) delete encodings[channel];
    else encodings[channel] = { field, type: channel === 'y' ? 'quantitative' : 'nominal' };
    changeDraft({ encodings });
  };

  return (
    // `min-h-0` + `flex-1`: the outer shell (width/border/background, plus
    // the grid-item height constraint that makes this scroll internally
    // instead of pushing the page layout) now lives on the `<aside>` wrapper
    // in chat-screen.tsx, shared with AutomationsSidebar stacked below this.
    // `flex-1` is what lets that shared column give this section the
    // remaining space once AutomationsSidebar's own (shrink-0) height is
    // accounted for.
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('flex min-h-0 flex-col', open ? 'flex-1' : 'shrink-0')}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="-mx-1.5 -my-1 flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left transition-colors hover:bg-muted"
          >
            <ChevronDownIcon
              size={16}
              className={open ? 'transition-transform' : '-rotate-90 transition-transform'}
            />
            <h3 className="m-0 text-caption font-semibold text-foreground">
              {t('chart.title')}{' '}
              <span className="text-caption font-normal text-muted-foreground">
                ({charts.length})
              </span>
            </h3>
          </button>
        </CollapsibleTrigger>
        <Button size="sm" onClick={() => setNewChartSql('')}>
          {t('chart.new')}
        </Button>
      </div>
      <CollapsibleContent className="flex min-h-0 flex-1 flex-col">
        {error && (
          <p className="m-3 shrink-0 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-caption text-destructive">
            {error}
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex cursor-pointer items-center gap-1 self-start border-0 bg-transparent p-0 text-caption font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeftIcon size={14} />
                {t('chart.title')}
              </button>
              <section className="mt-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="m-0 truncate text-caption font-semibold text-foreground">
                      {selected.title}
                    </h4>
                    <p className="m-0 mt-1 text-micro text-muted-foreground">
                      {selected.chartType} · v{selected.version}
                    </p>
                    {provenanceLabel && (
                      <button
                        type="button"
                        onClick={handleInspectRun}
                        className="mt-1 block cursor-pointer border-0 bg-transparent p-0 text-left text-micro text-primary underline-offset-2 hover:underline"
                      >
                        {provenanceLabel}
                      </button>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEditor(selected)}>
                    {t('chart.edit')}
                  </Button>
                </div>
                {selected.status === 'error' && (
                  <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                    <p className="m-0 text-caption leading-4 text-destructive">
                      {selected.errorMessage ?? t('chart.status.error')}
                    </p>
                    <Button
                      variant="destructive-ghost"
                      size="xs"
                      className="mt-2"
                      aria-busy={retrying}
                      disabled={retrying}
                      onClick={() => void retrySelected()}
                    >
                      {retrying ? t('chart.errorRetrying') : t('chart.errorRetry')}
                    </Button>
                  </div>
                )}
                {selected.data.length > 0 ? (
                  <ChatChartCard chart={selected} />
                ) : selected.status === 'draft' ? (
                  <div className="mt-3 flex items-center gap-2 text-caption text-muted-foreground">
                    <Spinner className="size-5" />
                    {t('chart.status.draft')}
                  </div>
                ) : selected.status !== 'error' ? (
                  <p className="mt-3 text-caption text-muted-foreground">{t('chart.noData')}</p>
                ) : null}
              </section>
            </>
          ) : charts.length === 0 && !error ? (
            <p className="py-6 text-center text-caption text-muted-foreground">
              {t('chart.empty')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {charts.map((chart) => (
                <li key={chart.id}>
                  <div className="flex items-center gap-1.5 rounded-md py-1 transition-colors">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(chart.id);
                        setDirty(false);
                        setSaveState('saved');
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-1 py-0.5 text-left transition-colors hover:bg-muted"
                    >
                      <ChartIcon size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                        {chart.title}
                      </span>
                      <span className="shrink-0 text-micro text-muted-foreground">
                        {chart.chartType}
                      </span>
                      {/* The spinner belongs to work actually running, not to
                       * the chart's resting status. */}
                      {filling === chart.id ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-micro text-primary">
                          <Spinner className="size-4" />
                          {t('chart.status.running')}
                        </span>
                      ) : (
                        <span className="shrink-0 text-micro">
                          <ChartStatusLabel status={chart.status} t={t} />
                        </span>
                      )}
                    </button>
                    {onAttachChart && (
                      <IconButton
                        label={t('chart.attach')}
                        size="sm"
                        onClick={() => onAttachChart({ id: chart.id, title: chart.title })}
                      >
                        {/* Same glyph as the composer's own (still-disabled)
                          file-attach button — both mean "add as context". */}
                        <svg className="h-[14px] w-[14px]" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M10 3v11a2.5 2.5 0 0 0 5 0V5.5a1.5 1.5 0 0 0-3 0V13"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </IconButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>

      <Dialog
        open={newChartSql !== null}
        onOpenChange={(next) => {
          if (!next) setNewChartSql(null);
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('chart.new')}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const sql = (newChartSql ?? '').trim();
              if (sql.length === 0 || creating) return;
              setCreating(true);
              void startNew(sql).finally(() => {
                setCreating(false);
                setNewChartSql(null);
              });
            }}
          >
            <TextareaField
              autoFocus
              hint={t('chart.newSqlHint')}
              textareaClassName="min-h-[140px] font-mono text-caption"
              label={t('chart.sql')}
              onChange={(event) => setNewChartSql(event.currentTarget.value)}
              placeholder="SELECT ..."
              value={newChartSql ?? ''}
            />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setNewChartSql(null)} type="button" variant="outline">
                {t('action.cancel')}
              </Button>
              <Button
                aria-busy={creating}
                disabled={creating || (newChartSql ?? '').trim().length === 0}
                type="submit"
              >
                {t('chart.new')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editingChart && draft && (
        <ChartEditModal
          chart={editingChart}
          draft={draft}
          fields={fields}
          saveState={saveState}
          onClose={() => setEditingId(null)}
          onChangeDraft={changeDraft}
          onChangeChannel={changeChannel}
          onDelete={() => void removeSelected()}
          setChartDataFromCsv={setChartDataFromCsv}
          onCsvUploaded={applyChart}
          patchChart={patchChart}
          submitQuery={submitQuery}
          monitorQuery={monitorQuery}
          listQueryCatalogs={listQueryCatalogs}
          suggestChartEncodings={suggestChartEncodings}
          userId={userId}
          onQueryRefreshed={applyChart}
          t={t}
        />
      )}
    </Collapsible>
  );
}

function mergeCharts(
  current: readonly ChartViewModel[],
  incoming: readonly ChartViewModel[],
): readonly ChartViewModel[] {
  const byId = new Map(current.map((chart) => [chart.id, chart]));
  for (const chart of incoming) {
    const previous = byId.get(chart.id);
    if (!previous || chart.version >= previous.version) byId.set(chart.id, chart);
  }
  return [...byId.values()];
}

interface ChartEditModalProps {
  readonly chart: ChartViewModel;
  readonly draft: Draft;
  readonly fields: readonly string[];
  readonly saveState: 'saved' | 'saving' | 'conflict';
  readonly onClose: () => void;
  readonly onChangeDraft: (change: Partial<Draft>) => void;
  readonly onChangeChannel: (channel: ChartChannel, field: string) => void;
  readonly onDelete: () => void;
  readonly setChartDataFromCsv: SetChartDataFromCsvController;
  readonly onCsvUploaded: (chart: ChartViewModel) => void;
  readonly patchChart: PatchChartController;
  readonly submitQuery?: SubmitQueryController;
  readonly monitorQuery?: MonitorQueryController;
  readonly listQueryCatalogs?: ListQueryCatalogsController;
  readonly suggestChartEncodings?: SuggestChartEncodingsController;
  readonly userId: string;
  readonly onQueryRefreshed: (chart: ChartViewModel) => void;
  readonly t: Translator;
}

function ChartEditModal({
  chart,
  draft,
  fields,
  saveState,
  onClose,
  onChangeDraft,
  onChangeChannel,
  onDelete,
  setChartDataFromCsv,
  onCsvUploaded,
  patchChart,
  submitQuery,
  monitorQuery,
  listQueryCatalogs,
  suggestChartEncodings,
  userId,
  onQueryRefreshed,
  t,
}: ChartEditModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t('chart.editor')}</DialogTitle>
        </DialogHeader>
        {/* Header stays fixed via the grid row above; this row is capped by
         * `minmax(0,1fr)` and scrolls internally, matching the pattern
         * already used for the chart list/viewer regions further up this
         * file (min-h-0 + overflow-y-auto) — the SQL editor's fixed
         * h-[280px]/h-[340px] plus the encoding fields routinely exceed a
         * laptop viewport, and without this the modal simply clipped at the
         * screen edge instead of scrolling. */}
        <div className="grid min-h-0 gap-5 overflow-y-auto pr-1">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div className="min-w-0">
              <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-primary">
                {t('chart.edit')}
              </p>
              <p className="m-0 mt-1 truncate text-sm font-medium text-foreground">{chart.title}</p>
              <p className="m-0 mt-1 text-caption text-muted-foreground">
                {chart.chartType} · v{chart.version}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-1 text-micro font-medium ${
                saveState === 'conflict'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : saveState === 'saving'
                    ? 'border-status-warning/40 bg-status-warning-light text-status-warning-dark'
                    : 'border-status-success/30 bg-status-success-light text-status-success-dark'
              }`}
            >
              {saveState === 'saving'
                ? t('chart.save')
                : saveState === 'conflict'
                  ? t('chart.conflict')
                  : t('chart.saved')}
            </span>
          </div>

          {saveState === 'conflict' && (
            <p
              role="alert"
              className="m-0 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-caption leading-5 text-destructive"
            >
              {t('chart.conflict')}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('chart.name')}
              value={draft.title}
              onChange={(event) => onChangeDraft({ title: event.currentTarget.value })}
            />
            <SelectField
              label={t('chart.type')}
              value={draft.chartType}
              data={chartTypes.map((type) => ({ value: type, label: type }))}
              onChange={(value) => onChangeDraft({ chartType: value as ChartType })}
            />
          </div>

          <div>
            <h4 className="m-0 text-caption font-semibold text-foreground">
              {t('chart.encodings')}
            </h4>
            <p className="m-0 mt-1 text-caption leading-4 text-muted-foreground">
              {t('chart.encodingHint')}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {channels.map(({ key, labelKey }) => (
              <SelectField
                key={key}
                label={t(labelKey)}
                value={draft.encodings[key]?.field ?? ''}
                data={[
                  { value: '', label: t('chart.noField') },
                  ...fields.map((field) => ({ value: field, label: field })),
                ]}
                onChange={(value) => onChangeChannel(key, value)}
              />
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <p className="m-0 text-caption font-medium text-foreground">
              {t('chart.recommendations')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recommendChartTypes(chart.data).map((type) => (
                <Button
                  key={type}
                  variant="ghost"
                  size="xs"
                  onClick={() => onChangeDraft({ chartType: type })}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {submitQuery && monitorQuery && listQueryCatalogs && (
            <ChartQueryRow
              key={chart.id}
              chart={chart}
              sql={draft.sql ?? ''}
              onChangeSql={(sql) => onChangeDraft({ sql })}
              patchChart={patchChart}
              submitQuery={submitQuery}
              monitorQuery={monitorQuery}
              listQueryCatalogs={listQueryCatalogs}
              suggestChartEncodings={suggestChartEncodings}
              userId={userId}
              onRefreshed={onQueryRefreshed}
              t={t}
            />
          )}

          <ChartExportRow chart={chart} t={t} />

          <ChartCsvUploadRow
            chart={chart}
            setChartDataFromCsv={setChartDataFromCsv}
            onUploaded={(updated) => {
              onCsvUploaded(updated);
              onChangeDraft({ sql: null });
            }}
            t={t}
          />

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="destructive-ghost" size="sm" onClick={onDelete}>
              {t('chart.delete')}
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t('chart.done')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChartStatusLabel({
  status,
  t,
}: {
  readonly status: ChartViewModel['status'];
  readonly t: Translator;
}) {
  if (status === 'draft') {
    // A spinner here claimed work was in progress when nothing was running:
    // `draft` is a resting state, not a step. It means the chart has no rows
    // or no encoding yet, and the way out is running its query.
    return <span className="text-muted-foreground">{t('chart.status.draft')}</span>;
  }
  if (status === 'error') {
    return <span className="text-destructive">{t('chart.status.error')}</span>;
  }
  return <span>{status}</span>;
}

const EXPORT_FORMATS: readonly ChartExportFormat[] = ['png', 'svg', 'json'];

const EXPORT_LABEL_KEYS: Readonly<
  Record<ChartExportFormat, 'chart.exportPng' | 'chart.exportSvg' | 'chart.exportJson'>
> = {
  png: 'chart.exportPng',
  svg: 'chart.exportSvg',
  json: 'chart.exportJson',
};

function ChartExportRow({ chart, t }: { readonly chart: ChartViewModel; readonly t: Translator }) {
  const [exporting, setExporting] = useState<ChartExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (format: ChartExportFormat) => {
    if (chart.data.length === 0) return;
    setExporting(format);
    setExportError(null);
    try {
      await exportChart(chart.id, chart.title, format, {
        chartType: chart.chartType,
        encodings: chart.encodings,
        data: chart.data,
      });
    } catch {
      setExportError(t('chart.exportError'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="border-t border-border pt-4">
      <p className="m-0 text-caption font-medium text-foreground">{t('chart.export')}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXPORT_FORMATS.map((format) => (
          <Button
            key={format}
            variant="ghost"
            size="xs"
            aria-busy={exporting === format}
            disabled={chart.data.length === 0 || exporting === format}
            onClick={() => void handleExport(format)}
          >
            {t(EXPORT_LABEL_KEYS[format])}
          </Button>
        ))}
      </div>
      {exportError && (
        <p role="alert" className="mt-1 text-caption text-destructive">
          {exportError}
        </p>
      )}
    </div>
  );
}

function ChartCsvUploadRow({
  chart,
  setChartDataFromCsv,
  onUploaded,
  t,
}: {
  readonly chart: ChartViewModel;
  readonly setChartDataFromCsv: SetChartDataFromCsvController;
  readonly onUploaded: (chart: ChartViewModel) => void;
  readonly t: Translator;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const updated = await setChartDataFromCsv({
        id: chart.id,
        expectedVersion: chart.version,
        file,
      });
      onUploaded(updated);
    } catch (reason: unknown) {
      setUploadError(
        reason instanceof Error && reason.name === 'ConflictError'
          ? t('chart.conflict')
          : reason instanceof Error
            ? reason.message
            : t('chart.csvUploadFailed'),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-t border-border pt-4">
      <FileInput
        label={t('chart.csvUpload')}
        hint={t('chart.csvUploadHint')}
        accept=".csv,text/csv"
        disabled={uploading}
        onChange={(file) => void handleFile(file)}
      />
      {uploading && (
        <div className="mt-2 flex items-center gap-2 text-caption text-muted-foreground">
          <Spinner className="size-5" />
          {t('chart.csvUploading')}
        </div>
      )}
      {uploadError && (
        <p role="alert" className="mt-2 text-caption text-destructive">
          {uploadError}
        </p>
      )}
    </div>
  );
}

/**
 * Runs one query to completion and returns its rows as records.
 *
 * `monitorQuery` streams snapshots; creating a chart has nothing to show
 * mid-flight, so this collapses the stream into the one thing that flow
 * needs. The editor's own Refresh keeps using the stream directly — it
 * renders the partial result as it arrives.
 */
async function runQueryToCompletion(
  sql: string,
  catalog: string,
  submitQuery: SubmitQueryController,
  monitorQuery: MonitorQueryController,
): Promise<{
  readonly records: readonly Record<string, unknown>[];
  readonly columns: readonly string[];
}> {
  const accepted = await submitQuery({ sql, context: { catalog } });
  return new Promise((resolve, reject) => {
    const handle = monitorQuery(accepted.id, {
      onError: (error) => {
        handle.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      onSnapshot: (result) => {
        if (!isTerminalStatus(result.status)) return;
        handle.close();
        if (result.failure) {
          reject(new Error(result.failure.message));
          return;
        }
        if (!result.resultsAvailable) {
          resolve({ records: [], columns: [] });
          return;
        }
        resolve({
          records: result.rows.map((row) =>
            Object.fromEntries(result.columns.map((column, index) => [column.name, row[index]])),
          ),
          columns: result.columns.map((column) => column.name),
        });
      },
    });
  });
}

function ChartQueryRow({
  chart,
  sql,
  onChangeSql,
  patchChart,
  submitQuery,
  monitorQuery,
  listQueryCatalogs,
  suggestChartEncodings,
  userId,
  onRefreshed,
  t,
}: {
  readonly chart: ChartViewModel;
  readonly sql: string;
  readonly onChangeSql: (sql: string) => void;
  readonly patchChart: PatchChartController;
  readonly submitQuery: SubmitQueryController;
  readonly monitorQuery: MonitorQueryController;
  readonly listQueryCatalogs: ListQueryCatalogsController;
  readonly suggestChartEncodings?: SuggestChartEncodingsController;
  readonly userId: string;
  readonly onRefreshed: (chart: ChartViewModel) => void;
  readonly t: Translator;
}) {
  const [catalogs, setCatalogs] = useState<readonly { name: string }[] | undefined>(undefined);
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [previewResult, setPreviewResult] = useState<SqlExecutionResultViewModel | undefined>(
    undefined,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const monitorRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listQueryCatalogs()
      .then((items) => {
        if (cancelled) return;
        setCatalogs(items);
        setSelectedCatalog((current) => current || (items[0]?.name ?? ''));
      })
      .catch(() => {
        if (!cancelled) setCatalogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listQueryCatalogs]);

  useEffect(() => {
    return () => {
      monitorRef.current?.close();
      monitorRef.current = null;
    };
  }, []);

  const handleRefresh = async () => {
    if (refreshing || sql.trim().length === 0 || !selectedCatalog) return;
    monitorRef.current?.close();
    monitorRef.current = null;
    setRefreshing(true);
    setRefreshError(null);
    setPreviewResult(undefined);
    try {
      const accepted = await submitQuery({ sql, context: { catalog: selectedCatalog } });
      monitorRef.current = monitorQuery(accepted.id, {
        onSnapshot: (result) => {
          setPreviewResult(result);
          if (!isTerminalStatus(result.status)) return;
          monitorRef.current?.close();
          monitorRef.current = null;
          setRefreshing(false);
          if (result.failure || !result.resultsAvailable) return;
          const records = result.rows.map((row) =>
            Object.fromEntries(result.columns.map((column, index) => [column.name, row[index]])),
          );
          void patchChart({
            id: chart.id,
            expectedVersion: chart.version,
            patch: { data: records, sql },
          })
            .then((saved) => {
              onRefreshed(saved);
              // Silent background step: ask the agent to decide encodings for
              // this chart's (possibly brand-new) columns. Not awaited, not
              // reflected in `refreshing`/`refreshError` — those are already
              // settled above. Any failure (bad output, version conflict) is
              // swallowed; the chart simply keeps whatever encodings it had.
              if (!suggestChartEncodings) return;
              void suggestChartEncodings({
                userId,
                title: saved.title,
                chartType: saved.chartType,
                columns: result.columns.map((column) => column.name),
                sampleRows: records.slice(0, 5),
              })
                .then((suggestion) =>
                  patchChart({
                    id: saved.id,
                    expectedVersion: saved.version,
                    patch: { chartType: suggestion.chartType, encodings: suggestion.encodings },
                  }),
                )
                .then(onRefreshed)
                .catch((error: unknown) => {
                  console.warn('Background chart-encoding inference failed:', error);
                });
            })
            .catch((reason: unknown) => {
              setRefreshError(
                reason instanceof Error && reason.name === 'ConflictError'
                  ? t('chart.conflict')
                  : reason instanceof Error
                    ? reason.message
                    : t('chart.refreshError'),
              );
            });
        },
        onError: (error: unknown) => {
          monitorRef.current = null;
          setRefreshing(false);
          setRefreshError(error instanceof Error ? error.message : t('chart.refreshError'));
        },
      });
    } catch (reason: unknown) {
      setRefreshing(false);
      setRefreshError(reason instanceof Error ? reason.message : t('chart.refreshError'));
    }
  };

  return (
    <div className="border-t border-border pt-4">
      <p className="m-0 text-caption font-medium text-foreground">{t('chart.sql')}</p>
      <p className="m-0 mt-1 text-caption leading-4 text-muted-foreground">{t('chart.sqlHint')}</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <SelectField
          label={t('chart.sqlCatalog')}
          className="min-w-[160px] flex-1"
          data={
            catalogs === undefined
              ? [{ value: '', label: '…' }]
              : catalogs.length === 0
                ? [{ value: '', label: t('chart.sqlNoCatalogs') }]
                : catalogs.map((catalog) => ({ value: catalog.name, label: catalog.name }))
          }
          value={selectedCatalog}
          onChange={setSelectedCatalog}
          disabled={refreshing || !catalogs || catalogs.length === 0}
        />
        <Button
          variant="secondary"
          size="sm"
          aria-busy={refreshing}
          disabled={refreshing || sql.trim().length === 0 || !selectedCatalog}
          onClick={() => void handleRefresh()}
        >
          {refreshing ? t('chart.refreshing') : t('chart.refresh')}
        </Button>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-border">
        <SqlEditor modelKey={`chart-${chart.id}`} value={sql} onChange={onChangeSql} />
      </div>

      {refreshError && (
        <p role="alert" className="mt-2 text-caption text-destructive">
          {refreshError}
        </p>
      )}

      <div className="mt-3">
        <p className="m-0 text-caption font-medium text-foreground">{t('chart.preview')}</p>
        {previewResult ? (
          previewResult.failure ? (
            <div className="mt-2">
              <QueryFailureView failure={previewResult.failure} />
            </div>
          ) : (
            <div className="mt-2">
              <ResultGrid
                columns={previewResult.columns}
                rows={previewResult.rows}
                truncated={previewResult.truncated}
                resultsAvailable={previewResult.resultsAvailable}
                {...(previewResult.rowCount !== undefined
                  ? { rowCount: previewResult.rowCount }
                  : {})}
              />
            </div>
          )
        ) : (
          <p className="m-0 mt-1 text-caption text-muted-foreground">{t('chart.previewEmpty')}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Draws a chat chart.
 *
 * This was ~150 lines of Vega plumbing: a `vega-embed` call, a dataset-name
 * literal kept in sync with Core by hand, a spec signature so a streamed row
 * refresh could patch the view in place rather than re-embed, and a
 * ResizeObserver that re-embedded on every resize.
 *
 * Recharts needs none of it. A streamed `chart_update` is new props, and
 * `ResponsiveContainer` owns sizing — so the fast path and the resize path both
 * become React re-rendering. The chart also reads `chartType` + `encodings`
 * rather than Core's derived `vl_spec`, which is what lets its colours come
 * from `--mchart-*` instead of being baked into a compiled spec.
 */
function ChatChartCard({ chart }: { readonly chart: ChartViewModel }) {
  const { t } = useTranslation();
  const view = useMemo(
    () => chartEncodingsToView(chart.chartType, chart.encodings, chart.data),
    [chart.chartType, chart.encodings, chart.data],
  );

  if (!view) {
    return (
      <p className="m-0 mt-2 text-caption text-destructive" role="alert">
        {t('chart.renderError')}
      </p>
    );
  }

  return (
    <div className="mt-4 w-full">
      <div
        className="w-full overflow-hidden rounded-lg border border-border bg-card p-2"
        {...chartExportRootAttribute(chart.id)}
      >
        <ChartView view={view} height={220} ariaLabel={chart.title} />
      </div>
    </div>
  );
}
