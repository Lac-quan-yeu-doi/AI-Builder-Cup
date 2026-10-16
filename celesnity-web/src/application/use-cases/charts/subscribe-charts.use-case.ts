import type { Chart } from '@/src/entities/models/chart';
import type {
  ChartProgressService,
  ChartProgressSubscription,
} from '@/src/application/services/chart-progress.service.interface';

export type { ChartProgressSubscription };

export interface SubscribeChartsHandlers {
  onChart(chart: Chart): void;
  onDeleted?(chartId: string): void;
  onOpen?(): void;
  onError(error: unknown): void;
}

export type SubscribeChartsUseCase = (
  handlers: SubscribeChartsHandlers,
) => ChartProgressSubscription;

export const createSubscribeChartsUseCase =
  (progressService: ChartProgressService): SubscribeChartsUseCase =>
  (handlers: SubscribeChartsHandlers): ChartProgressSubscription => {
    return progressService.subscribe({
      onChart: handlers.onChart,
      onDeleted: handlers.onDeleted,
      onOpen: handlers.onOpen,
      onError: handlers.onError,
    });
  };
