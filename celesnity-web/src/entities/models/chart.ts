export const CHART_TYPES = ['bar', 'line', 'area', 'point', 'pie', 'arc', 'scatter'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export type ChartStatus = 'draft' | 'ready' | 'error';

export type ChartChannel = 'x' | 'y' | 'color' | 'size' | 'shape' | 'facet';

export interface ChartEncoding {
  readonly field: string;
  readonly type?: 'quantitative' | 'temporal' | 'ordinal' | 'nominal';
  readonly aggregate?: string;
  readonly title?: string;
  readonly sort?: string | readonly string[];
}

export type ChartEncodings = Partial<Record<ChartChannel, ChartEncoding>>;
export type ChartDataRow = Record<string, unknown>;

export interface CreateChartInput {
  readonly runId?: string | null;
  readonly title: string;
  readonly chartType: ChartType;
  readonly encodings?: ChartEncodings;
  readonly data?: readonly ChartDataRow[];
  readonly config?: Record<string, unknown>;
  readonly sql?: string;
}

export interface PatchChartInput {
  readonly title?: string;
  readonly chartType?: ChartType;
  readonly encodings?: ChartEncodings;
  readonly data?: readonly ChartDataRow[];
  readonly config?: Record<string, unknown>;
  readonly vlSpec?: Record<string, unknown> | null;
  /** `undefined` preserves the chart's existing `sql`; `null` clears it. */
  readonly sql?: string | null;
}

export function recommendChartTypes(data: readonly ChartDataRow[]): readonly ChartType[] {
  const first = data[0];
  if (!first) return ['bar', 'line', 'scatter'];
  const numeric = Object.keys(first).filter((key) => typeof first[key] === 'number');
  const temporal = Object.keys(first).filter((key) => {
    const value = first[key];
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  });
  if (temporal.length > 0 && numeric.length > 0) return ['line', 'area', 'bar'];
  if (numeric.length >= 2) return ['scatter', 'bar', 'point'];
  return ['bar', 'pie', 'point'];
}

export interface Chart {
  readonly id: string;
  readonly runId: string | null;
  readonly title: string;
  readonly chartType: ChartType;
  readonly encodings: ChartEncodings;
  readonly data: readonly ChartDataRow[];
  readonly config: Record<string, unknown>;
  readonly vlSpec: Record<string, unknown> | null;
  readonly sql: string | null;
  readonly status: ChartStatus;
  readonly errorMessage: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
