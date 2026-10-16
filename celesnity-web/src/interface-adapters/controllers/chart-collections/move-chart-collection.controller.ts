import type { ChartCollectionUseCases } from '@/src/application/use-cases/chart-collections/manage-chart-collection.use-cases';
import type { ChartCollection } from '@/src/entities/models/chart-collection';

export type MoveChartCollectionController = ReturnType<typeof createMoveChartCollectionController>;

export const createMoveChartCollectionController =
  (useCases: ChartCollectionUseCases) =>
  (id: string, parentId: string | null): Promise<ChartCollection> => {
    if (!id.trim()) throw new Error('Collection id is required.');
    return useCases.move(id.trim(), parentId?.trim() || null);
  };
