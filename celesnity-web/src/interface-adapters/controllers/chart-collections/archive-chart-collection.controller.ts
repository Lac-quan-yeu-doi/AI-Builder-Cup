import type { ChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';

export type ArchiveChartCollectionController = ReturnType<
  typeof createArchiveChartCollectionController
>;

export const createArchiveChartCollectionController =
  (useCases: ChartCollectionUseCases) =>
  async (id: string): Promise<void> => {
    if (!id.trim()) throw new Error('Collection id is required.');
    await useCases.archive(id.trim());
  };
