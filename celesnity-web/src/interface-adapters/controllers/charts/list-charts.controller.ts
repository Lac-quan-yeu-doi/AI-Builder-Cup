import type { ListChartsUseCase } from '@/src/application/use-cases/charts/list-charts.use-case';
import {
  presentChart,
  type ChartViewModel,
} from '@/src/interface-adapters/presenters/chart.presenter';

export type ListChartsController = () => Promise<readonly ChartViewModel[]>;

export const createListChartsController =
  (useCase: ListChartsUseCase): ListChartsController =>
  async (): Promise<readonly ChartViewModel[]> => {
    const charts = await useCase();
    return charts.map(presentChart);
  };
