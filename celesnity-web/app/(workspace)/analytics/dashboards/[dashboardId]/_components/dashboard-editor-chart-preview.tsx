'use client';

import { useEffect, useState } from 'react';

import { ChartRenderPreview } from '@/app/_components/shared/chart-render-preview';
import { getInjection } from '@/di/container';
import type { CanonicalChart } from '@/src/entities/models/canonical-chart';
import type { DashboardCard } from '@/src/entities/models/dashboard';
import type { ChartPreviewViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { DashboardTablePreview } from './dashboard-table-preview';

const getChart = getInjection('GetCanonicalChartController');
const runChart = getInjection('RunSavedCanonicalChartController');
const renderer = getInjection('ChartRendererService');

export function DashboardEditorChartPreview({
  card,
}: {
  readonly card: Extract<DashboardCard, { kind: 'CHART' }>;
}) {
  const [chart, setChart] = useState<CanonicalChart | null>(null);
  const [preview, setPreview] = useState<ChartPreviewViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getChart(card.chartId),
      runChart({ chartId: card.chartId, parameterValues: {} }),
    ])
      .then(([loadedChart, loadedPreview]) => {
        if (!active) return;
        setChart(loadedChart);
        setPreview(loadedPreview);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to preview chart.');
      });
    return () => {
      active = false;
    };
  }, [card.chartId]);

  if (error) {
    return (
      <p role="alert" className="text-body-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!chart || !preview) {
    return <p className="text-body-sm text-muted-foreground">Loading chart…</p>;
  }

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-col">
      <h3 className="mb-2 shrink-0 font-semibold">{chart.title}</h3>
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {chart.visualizationDefinition.type === 'TABLE' ? (
          <DashboardTablePreview columns={preview.columns} rows={preview.rows} />
        ) : (
          <ChartRenderPreview
            draft={{
              title: chart.title,
              description: chart.description,
              collectionId: chart.collectionId,
              queryDefinition: chart.queryDefinition,
              visualizationDefinition: chart.visualizationDefinition,
              outputSchema: chart.outputSchema,
              parameterValues: {},
            }}
            rows={preview.rows}
            renderer={renderer}
          />
        )}
      </div>
    </div>
  );
}
