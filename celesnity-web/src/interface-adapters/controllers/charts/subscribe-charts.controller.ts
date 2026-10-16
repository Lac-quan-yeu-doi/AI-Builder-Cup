import type {
  ChartProgressSubscription,
  SubscribeChartsUseCase,
} from '@/src/application/use-cases/charts/subscribe-charts.use-case';
import {
  presentChart,
  type ChartViewModel,
} from '@/src/interface-adapters/presenters/chart.presenter';

export interface SubscribeChartsControllerHandlers {
  onChart(chart: ChartViewModel): void;
  onDeleted?(chartId: string): void;
  onOpen?(): void;
  onError(error: unknown): void;
}

export type SubscribeChartsController = (
  handlers: SubscribeChartsControllerHandlers,
) => ChartProgressSubscription;

export const createSubscribeChartsController =
  (useCase: SubscribeChartsUseCase): SubscribeChartsController =>
  (handlers: SubscribeChartsControllerHandlers): ChartProgressSubscription => {
    return useCase({
      onChart: (chart) => handlers.onChart(presentChart(chart)),
      onDeleted: handlers.onDeleted,
      onOpen: handlers.onOpen,
      onError: handlers.onError,
    });
  };
