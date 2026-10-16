import type { Chart } from '@/src/entities/models/chart';

export interface ChartViewModel {
  readonly id: string;
  readonly runId: string | null;
  readonly title: string;
  readonly chartType: import('@/src/entities/models/chart').ChartType;
  readonly encodings: import('@/src/entities/models/chart').ChartEncodings;
  readonly data: readonly import('@/src/entities/models/chart').ChartDataRow[];
  readonly config: Record<string, unknown>;
  readonly vlSpec: Record<string, unknown> | null;
  readonly sql: string | null;
  readonly status: 'draft' | 'ready' | 'error';
  readonly errorMessage: string | null;
  readonly version: number;
}

export function presentChart(chart: Chart): ChartViewModel {
  return Object.freeze({
    id: chart.id,
    runId: chart.runId,
    title: chart.title,
    chartType: chart.chartType,
    encodings: clone(chart.encodings),
    data: clone(chart.data),
    config: clone(chart.config),
    vlSpec: chart.vlSpec,
    sql: chart.sql,
    status: chart.status,
    errorMessage: chart.errorMessage,
    version: chart.version,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
