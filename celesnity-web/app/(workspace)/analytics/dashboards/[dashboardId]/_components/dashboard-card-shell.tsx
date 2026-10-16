'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ChartRenderPreview } from '@/app/_components/shared/chart-render-preview';
import { getInjection } from '@/di/container';
import type { DashboardChartRuntimeResult } from '@/src/entities/models/dashboard-runtime';
import type {
  CanonicalChart,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';
import type {
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
} from '@/src/entities/models/dashboard';
import { DashboardFilterControls } from './dashboard-filter-controls';
import { DashboardTablePreview } from './dashboard-table-preview';
import { renderDashboardContentVariables } from './dashboard-content-variables';
import type { DashboardRuntimeCardState } from './dashboard-runtime-state';

const getChart = getInjection('GetCanonicalChartController');
const listChartRevisions = getInjection('ListCanonicalChartRevisionsController');
const renderer = getInjection('ChartRendererService');

export function DashboardCardShell({
  card,
  runtime,
  onRetry,
  inlineFilters = [],
  filterValues = {},
  onFilterChange = () => undefined,
  mappings = [],
}: {
  readonly card: DashboardCard;
  readonly runtime?: DashboardRuntimeCardState;
  readonly onRetry?: () => void;
  readonly inlineFilters?: readonly DashboardFilter[];
  readonly filterValues?: Readonly<Record<string, unknown>>;
  readonly onFilterChange?: (filterId: string, value: unknown) => void;
  readonly mappings?: readonly DashboardFilterMapping[];
}) {
  const style = {
    '--dashboard-column': `${card.geometry.x + 1} / span ${card.geometry.width}`,
    '--dashboard-row': `${card.geometry.y + 1} / span ${card.geometry.height}`,
  } as React.CSSProperties;

  if (card.kind === 'HEADING') {
    return (
      <section
        style={style}
        className="[grid-column:1/-1] md:[grid-column:var(--dashboard-column)] md:[grid-row:var(--dashboard-row)]"
      >
        {inlineFilters.length > 0 ? (
          <DashboardFilterControls
            filters={inlineFilters}
            values={filterValues}
            onChange={(filter, value) => onFilterChange(filter.id, value)}
          />
        ) : null}
        <h2 className="px-2 py-3 text-title">
          {renderDashboardContentVariables(card.content.text, card.id, mappings, filterValues)}
        </h2>
      </section>
    );
  }

  return (
    <article
      style={style}
      className="flex min-h-40 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-xs [grid-column:1/-1] md:min-h-0 md:[grid-column:var(--dashboard-column)] md:[grid-row:var(--dashboard-row)]"
    >
      {inlineFilters.length > 0 ? (
        <div className="mb-3 border-b border-border pb-3">
          <DashboardFilterControls
            filters={inlineFilters}
            values={filterValues}
            onChange={(filter, value) => onFilterChange(filter.id, value)}
          />
        </div>
      ) : null}
      {card.kind === 'TEXT' ? (
        <p className="whitespace-pre-wrap text-body-sm">
          {renderDashboardContentVariables(card.content.markdown, card.id, mappings, filterValues)}
        </p>
      ) : card.kind === 'LINK' ? (
        <a
          href={renderDashboardContentVariables(
            card.content.url,
            card.id,
            mappings,
            filterValues,
            true,
          )}
          className="font-medium text-primary hover:underline"
        >
          {renderDashboardContentVariables(card.content.label, card.id, mappings, filterValues)}
        </a>
      ) : (
        <DashboardChartCard card={card} runtime={runtime} onRetry={onRetry} />
      )}
    </article>
  );
}

function DashboardChartCard({
  card,
  runtime,
  onRetry,
}: {
  readonly card: Extract<DashboardCard, { kind: 'CHART' }>;
  readonly runtime?: DashboardRuntimeCardState;
  readonly onRetry?: () => void;
}) {
  const [chart, setChart] = useState<CanonicalChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeEnabled = runtime !== undefined;

  useEffect(() => {
    if (!runtimeEnabled) return;
    let active = true;
    void getChart(card.chartId)
      .then(async (loadedChart) => {
        if (
          card.chartRevisionNumber === null ||
          card.chartRevisionNumber === loadedChart.currentRevisionNumber
        )
          return loadedChart;
        const revisions = await listChartRevisions(card.chartId);
        const pinned = revisions.find(
          (revision) => revision.revisionNumber === card.chartRevisionNumber,
        );
        return pinned
          ? {
              ...loadedChart,
              title: pinned.title,
              queryDefinition: pinned.queryDefinition,
              visualizationDefinition: pinned.visualizationDefinition,
              outputSchema: pinned.outputSchema,
            }
          : loadedChart;
      })
      .then((loadedChart) => {
        if (active) setChart(loadedChart);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load chart.');
      });
    return () => {
      active = false;
    };
  }, [card.chartId, card.chartRevisionNumber, runtimeEnabled]);

  if (error)
    return (
      <p role="alert" className="text-body-sm text-destructive">
        {error}
      </p>
    );
  if (!chart || !runtime || runtime.status === 'IDLE' || runtime.status === 'LOADING') {
    return <p className="text-body-sm text-muted-foreground">Loading chart…</p>;
  }
  if (runtime.status === 'REQUIRES_FILTER') {
    return (
      <p className="text-body-sm text-muted-foreground">
        Choose a required filter value to load this chart.
      </p>
    );
  }
  if (runtime.status !== 'SUCCESS') {
    return (
      <div role="alert" className="grid gap-2 text-body-sm text-destructive">
        <span>{runtime.message ?? 'Unable to load chart.'}</span>
        {onRetry ? (
          <button
            type="button"
            className="w-fit font-medium text-primary hover:underline"
            onClick={onRetry}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  const result = runtime.result as DashboardChartRuntimeResult;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="font-semibold">{chart.title}</h3>
        <Link
          href={`/analytics/charts/${encodeURIComponent(card.chartId)}`}
          className="text-caption text-primary hover:underline"
        >
          Open chart
        </Link>
      </div>
      {chart.visualizationDefinition.type === 'TABLE' ? (
        <DashboardTablePreview columns={result.columns} rows={result.rows} />
      ) : (
        <ChartRenderPreview
          draft={{
            title: chart.title,
            description: chart.description,
            collectionId: chart.collectionId,
            queryDefinition: chart.queryDefinition,
            visualizationDefinition: applyVisualizationOverrides(
              chart.visualizationDefinition,
              card.visualizationOverrides,
            ),
            outputSchema: chart.outputSchema,
            parameterValues: {},
          }}
          rows={result.rows}
          renderer={renderer}
          fill
        />
      )}
    </div>
  );
}

function applyVisualizationOverrides(
  definition: VisualizationDefinition,
  overrides: Readonly<Record<string, unknown>>,
): VisualizationDefinition {
  return {
    ...definition,
    display: { ...definition.display, ...overrides },
  } as VisualizationDefinition;
}
