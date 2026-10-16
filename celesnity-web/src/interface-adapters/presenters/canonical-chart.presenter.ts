import type { CanonicalChart, ChartPreview } from '@/src/entities/models/canonical-chart';

export type CanonicalChartViewModel = Readonly<CanonicalChart>;
export type ChartPreviewViewModel = Readonly<ChartPreview>;

export function presentCanonicalChart(chart: CanonicalChart): CanonicalChartViewModel {
  return Object.freeze({
    ...chart,
    outputSchema: chart.outputSchema.slice(),
    queryDefinition: structuredClone(chart.queryDefinition),
    visualizationDefinition: structuredClone(chart.visualizationDefinition),
  });
}

export function presentChartPreview(preview: ChartPreview): ChartPreviewViewModel {
  return Object.freeze({
    ...preview,
    columns: preview.columns.slice(),
    rows: preview.rows.map((row) => row.slice()),
  });
}
