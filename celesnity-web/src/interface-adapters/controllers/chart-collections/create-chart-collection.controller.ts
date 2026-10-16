import type { ChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';
import type {
  ChartCollection,
  CreateChartCollectionInput,
} from '@/src/entities/models/chart-collection';

export type CreateChartCollectionController = ReturnType<
  typeof createCreateChartCollectionController
>;

export const createCreateChartCollectionController =
  (useCases: ChartCollectionUseCases) =>
  (input: CreateChartCollectionInput): Promise<ChartCollection> => {
    if (!input.name.trim()) throw new Error('Collection name is required.');
    return useCases.create({ ...input, name: input.name.trim() });
  };
