import type { ChartCollectionRepository } from '@/src/application/repositories/chart-collection.repository.interface';
import type { ChartCollection } from '@/src/entities/models/chart-collection';

export type ListChartCollectionsUseCase = () => Promise<readonly ChartCollection[]>;

export const createListChartCollectionsUseCase =
  (repository: ChartCollectionRepository): ListChartCollectionsUseCase =>
  () =>
    repository.list();
