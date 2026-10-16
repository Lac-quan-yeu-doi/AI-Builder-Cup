'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { cn } from '@/app/_components/ui/utils';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type {
  CanonicalChart,
  ChartDraft,
  ChartSummary,
  ParameterValue,
} from '@/src/entities/models/canonical-chart';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { CancelCanonicalChartRunController } from '@/src/interface-adapters/controllers/canonical-charts/cancel-canonical-chart-run.controller';
import type { GetCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/get-canonical-chart.controller';
import type { ListCanonicalChartsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-charts.controller';
import type { RunSavedCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/run-saved-canonical-chart.controller';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';
import type { ChartPreviewViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

import { ChartRenderPreview } from '@/app/_components/shared/chart-render-preview';
import { chartExportRootAttribute, exportChart, type ChartExportFormat } from './chart-export';

export interface CanonicalChartSidebarProps {
  readonly embedded?: boolean;
  readonly listCharts: ListCanonicalChartsController;
  readonly listCollections: ListChartCollectionsController;
  readonly getChart: GetCanonicalChartController;
  readonly runSavedChart: RunSavedCanonicalChartController;
  readonly cancelRun?: CancelCanonicalChartRunController;
  readonly renderer: ChartRenderer;
  readonly refreshNonce?: number;
  readonly focusChartRequest?: { readonly chartId: string; readonly nonce: number } | null;
  readonly onInspectRun?: (runId: string) => void;
  readonly onAttachChart?: (chart: { readonly id: string; readonly title: string }) => void;
}

/**
 * Canonical Chat-to-Chart viewer. Query and visualization definitions come
 * from Core; result rows exist only in this active component while a run is
 * being displayed. The sidebar deliberately has no legacy data/spec editor.
 */
export function CanonicalChartSidebar({
  embedded = false,
  listCharts,
  listCollections,
  getChart,
  runSavedChart,
  renderer,
  refreshNonce = 0,
  focusChartRequest,
  onInspectRun,
  onAttachChart,
}: CanonicalChartSidebarProps) {
  const router = useRouter();
  const [charts, setCharts] = useState<readonly ChartSummary[]>([]);
  const [personalCollectionId, setPersonalCollectionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<CanonicalChart | null>(null);
  const [preview, setPreview] = useState<ChartPreviewViewModel | null>(null);
  const [parameterValues, setParameterValues] = useState<Record<string, ParameterValue>>({});
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const selectedIdRef = useRef<string | null>(null);

  const runChart = useCallback(
    async (chartId: string, values?: Readonly<Record<string, ParameterValue>>): Promise<void> => {
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const chart = await getChart(chartId);
        if (sequence !== requestSequence.current) return;
        const defaults = parameterDefaults(chart);
        const nextValues = values ?? defaults;
        setSelected(chart);
        setSelectedId(chart.id);
        selectedIdRef.current = chart.id;
        setParameterValues({ ...nextValues });
        const result = await runSavedChart({ chartId: chart.id, parameterValues: nextValues });
        if (sequence !== requestSequence.current) return;
        setPreview(result);
      } catch (runError: unknown) {
        if (sequence !== requestSequence.current) return;
        // Clearing preview before execution is intentional: a failed latest
        // run must never display rows from an older successful run.
        setPreview(null);
        setError(runError instanceof Error ? runError.message : 'Chart run failed.');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [getChart, runSavedChart],
  );

  const loadCharts = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    try {
      const collections = await listCollections();
      const personal = flattenCollections(collections).find(
        (collection) => collection.kind === 'PERSONAL',
      );
      const collectionId = personal?.id ?? null;
      setPersonalCollectionId(collectionId);
      const nextCharts = await listCharts(collectionId ?? undefined);
      setCharts(nextCharts);
      const currentSelectedId = selectedIdRef.current;
      const retained =
        currentSelectedId && nextCharts.some((chart) => chart.id === currentSelectedId)
          ? currentSelectedId
          : null;
      const nextSelected = retained ?? nextCharts[0]?.id ?? null;
      setSelectedId(nextSelected);
      selectedIdRef.current = nextSelected;
      if (nextSelected) await runChart(nextSelected);
      else {
        setSelected(null);
        setPreview(null);
      }
    } catch (listError: unknown) {
      setError(listError instanceof Error ? listError.message : 'Charts could not be loaded.');
    } finally {
      setLoadingList(false);
    }
  }, [listCharts, listCollections, runChart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the sidebar from Core after mount and after assistant completion
    void loadCharts();
  }, [loadCharts, refreshNonce]);

  useEffect(() => {
    const request = focusChartRequest;
    if (!request?.chartId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- citation focus is an external navigation event
    setSelectedId(request.chartId);
    selectedIdRef.current = request.chartId;
    void runChart(request.chartId);
  }, [focusChartRequest, runChart]);

  const draft = useMemo<ChartDraft | null>(() => {
    if (!selected) return null;
    return {
      title: selected.title,
      description: selected.description,
      collectionId: selected.collectionId,
      queryDefinition: selected.queryDefinition,
      visualizationDefinition: selected.visualizationDefinition,
      outputSchema: preview?.columns.length ? preview.columns : selected.outputSchema,
      parameterValues,
    };
  }, [parameterValues, preview?.columns, selected]);

  const exportCurrent = async (format: ChartExportFormat): Promise<void> => {
    if (!draft || !preview || !selected) return;
    await exportChart(selected.id, draft.title, format, {
      chartType: draft.visualizationDefinition.type,
      encodings: draft.visualizationDefinition.roles,
      data: preview.rows,
    });
  };

  return (
    <aside
      className={cn(
        'grid min-h-0 border-border bg-background',
        embedded
          ? 'h-full grid-cols-[minmax(180px,250px)_minmax(320px,1fr)] border-0'
          : 'fixed inset-x-0 bottom-0 z-30 max-h-[min(78dvh,760px)] border-t shadow-2xl min-[1081px]:inset-y-14 min-[1081px]:left-auto min-[1081px]:right-0 min-[1081px]:grid-cols-[250px_minmax(360px,1fr)] min-[1081px]:border-l min-[1081px]:border-t-0 min-[1081px]:shadow-none',
      )}
    >
      <section className="min-h-0 overflow-auto border-r border-border p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Charts</h2>
            <p className="text-xs text-muted-foreground">Personal Collection</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                `/analytics/charts/new${personalCollectionId ? `?collectionId=${encodeURIComponent(personalCollectionId)}` : ''}`,
              )
            }
          >
            New
          </Button>
        </div>
        {loadingList && <p className="text-sm text-muted-foreground">Loading charts…</p>}
        {!loadingList && charts.length === 0 && (
          <p className="text-sm text-muted-foreground">No saved charts yet.</p>
        )}
        <div className="space-y-2">
          {charts.map((chart) => (
            <button
              type="button"
              key={chart.id}
              className={`w-full rounded-md border p-3 text-left transition-colors ${chart.id === selectedId ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'}`}
              aria-pressed={chart.id === selectedId}
              onClick={() => {
                setSelectedId(chart.id);
                selectedIdRef.current = chart.id;
                void runChart(chart.id);
              }}
            >
              <span className="block truncate text-sm font-medium">{chart.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {chart.provenance} · v{chart.currentRevisionNumber}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="min-h-0 overflow-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{selected?.title ?? 'Chart preview'}</h2>
            {selected && (
              <p className="text-xs text-muted-foreground">
                {selected.provenance} chart · revision {selected.currentRevisionNumber}
              </p>
            )}
          </div>
          {selected && (
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/analytics/charts/${selected.id}/edit`)}
              >
                Edit
              </Button>
              {onAttachChart && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onAttachChart({ id: selected.id, title: selected.title })}
                >
                  Attach
                </Button>
              )}
            </div>
          )}
        </div>

        {selected && selected.queryDefinition.parameters.length > 0 && (
          <div className="mt-4 grid gap-3 rounded-md border border-border p-3 md:grid-cols-2">
            {selected.queryDefinition.parameters.map((parameter) => (
              <label key={parameter.name} className="grid gap-1 text-sm font-medium">
                {parameter.name}{' '}
                <span className="text-xs font-normal text-muted-foreground">{parameter.type}</span>
                <Input
                  aria-label={`Chart parameter ${parameter.name}`}
                  value={formatValue(parameterValues[parameter.name])}
                  onChange={(event) =>
                    setParameterValues((current) => ({
                      ...current,
                      [parameter.name]: parseValue(parameter.type, event.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading && <p className="mt-6 text-sm text-muted-foreground">Running query…</p>}
        {!loading && !error && !selected && (
          <p className="mt-6 text-sm text-muted-foreground">
            Select a chart to run its saved query.
          </p>
        )}
        {!loading && !error && selected && preview && draft && (
          <>
            <div {...chartExportRootAttribute(selected.id)}>
              <ChartRenderPreview draft={draft} rows={preview.rows} renderer={renderer} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {preview.rowCount} rows{preview.truncated ? ' (truncated)' : ''}
              </span>
              <span>·</span>
              <span>Run {preview.runId}</span>
              {onInspectRun && (
                <Button type="button" variant="ghost" onClick={() => onInspectRun(preview.runId)}>
                  Inspect run
                </Button>
              )}
              {(['png', 'svg', 'json'] as const).map((format) => (
                <Button
                  key={format}
                  type="button"
                  variant="ghost"
                  onClick={() => void exportCurrent(format)}
                >
                  Export {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </>
        )}
        {!loading && !error && selected && !preview && (
          <p className="mt-6 text-sm text-muted-foreground">No rows returned by the latest run.</p>
        )}
        <div className="mt-5 flex gap-2">
          {selected && (
            <Button
              type="button"
              onClick={() => void runChart(selected.id, parameterValues)}
              disabled={loading}
            >
              {loading ? 'Running…' : 'Refresh'}
            </Button>
          )}
        </div>
      </section>
    </aside>
  );
}

function flattenCollections(collections: readonly ChartCollection[]): readonly ChartCollection[] {
  const result: ChartCollection[] = [];
  const visit = (items: readonly ChartCollection[]): void => {
    for (const item of items) {
      result.push(item);
      visit(item.children);
    }
  };
  visit(collections);
  return result;
}

function parameterDefaults(chart: CanonicalChart): Record<string, ParameterValue> {
  return Object.fromEntries(
    chart.queryDefinition.parameters.map((parameter) => [
      parameter.name,
      parameter.defaultValue ?? null,
    ]),
  );
}

function formatValue(value: ParameterValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseValue(
  type: CanonicalChart['queryDefinition']['parameters'][number]['type'],
  value: string,
): ParameterValue {
  if (!value) return null;
  if (type === 'NUMBER') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (type === 'BOOLEAN') return value.toLowerCase() === 'true';
  return value;
}
