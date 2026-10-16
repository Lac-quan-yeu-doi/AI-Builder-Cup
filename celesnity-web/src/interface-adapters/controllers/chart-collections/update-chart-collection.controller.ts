import type { ChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';
import type { ChartCollection } from '@/src/entities/models/chart-collection';

export type UpdateChartCollectionController = ReturnType<
  typeof createUpdateChartCollectionController
>;

export const createUpdateChartCollectionController =
  (useCases: ChartCollectionUseCases) =>
  (id: string, input: { readonly name: string }): Promise<ChartCollection> => {
    if (!id.trim() || !input.name.trim()) throw new Error('Collection id and name are required.');
    return useCases.update(id.trim(), { name: input.name.trim() });
  };
