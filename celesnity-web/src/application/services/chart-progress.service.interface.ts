import type { Chart } from '@/src/entities/models/chart';

export interface ChartProgressObserver {
  onChart(chart: Chart): void;
  onDeleted?(chartId: string): void;
  onOpen?(): void;
  onError(error: unknown): void;
}

export interface ChartProgressSubscription {
  close(): void;
}

export interface ChartProgressService {
  subscribe(observer: ChartProgressObserver): ChartProgressSubscription;
}
