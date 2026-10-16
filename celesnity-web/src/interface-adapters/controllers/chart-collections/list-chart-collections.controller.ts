import type { ListChartCollectionsUseCase } from '@/src/application/use-cases/chart-collections/list-chart-collections.use-case';
import type { ChartCollection } from '@/src/entities/models/chart-collection';

export type ListChartCollectionsController = ReturnType<
  typeof createListChartCollectionsController
>;

export const createListChartCollectionsController =
  (useCase: ListChartCollectionsUseCase) => (): Promise<readonly ChartCollection[]> =>
    useCase();
