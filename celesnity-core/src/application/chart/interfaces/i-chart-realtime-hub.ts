import type { Chart } from '@domain/chart/models/chart';

export type ChartRealtimeEvent =
  | {
      readonly kind: 'upsert';
      readonly sequence: number;
      readonly chart: Chart;
    }
  | {
      readonly kind: 'delete';
      readonly sequence: number;
      readonly chartId: string;
    };

/** Fan-out channel for chart updates. */
export interface IChartRealtimeHub {
  currentSequence(): number;
  publishUpsert(chart: Chart): void;
  publishDelete(chartId: string): void;
  subscribe(listener: (event: ChartRealtimeEvent) => void, sinceSequence?: number): () => void;
}
