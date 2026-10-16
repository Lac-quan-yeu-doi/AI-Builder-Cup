'use client';

import { useEffect, useState } from 'react';
import { getInjection } from '@/di/container';
import type { ChartDraft } from '@/src/entities/models/canonical-chart';
import { ChartBuilderFeature } from '@/app/_components/shared/chart-builder-feature';

const getChart = getInjection('GetCanonicalChartController');

export function EditChartFeature({ chartId }: { readonly chartId: string }) {
  const [draft, setDraft] = useState<ChartDraft | null>(null);
  const [revision, setRevision] = useState(1);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getChart(chartId)
      .then((chart) => {
        if (!active) return;
        setRevision(chart.currentRevisionNumber);
        setDraft({
          title: chart.title,
          description: chart.description,
          collectionId: chart.collectionId,
          queryDefinition: chart.queryDefinition,
          visualizationDefinition: chart.visualizationDefinition,
          outputSchema: chart.outputSchema,
          parameterValues: {},
        });
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load chart.');
      });
    return () => {
      active = false;
    };
  }, [chartId]);
  if (error)
    return (
      <p role="alert" className="p-8 text-body-sm text-destructive">
        {error}
      </p>
    );
  if (!draft) return <p className="p-8 text-body-sm text-muted-foreground">Loading chart…</p>;
  return <ChartBuilderFeature initialDraft={draft} chartId={chartId} expectedRevision={revision} />;
}
