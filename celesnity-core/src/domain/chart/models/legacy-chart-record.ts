export type LegacyChartStatus = 'draft' | 'ready' | 'error';
export type LegacyChartType = 'bar' | 'line' | 'area' | 'point' | 'pie' | 'arc' | 'scatter';

export interface LegacyChartRecord {
  readonly id: string;
  readonly runId: string | null;
  readonly title: string;
  readonly chartType: LegacyChartType;
  readonly encodings: Readonly<Record<string, unknown>>;
  readonly data: readonly Record<string, unknown>[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly vlSpec: Readonly<Record<string, unknown>> | null;
  readonly sql: string | null;
  readonly status: LegacyChartStatus;
  readonly errorMessage: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
