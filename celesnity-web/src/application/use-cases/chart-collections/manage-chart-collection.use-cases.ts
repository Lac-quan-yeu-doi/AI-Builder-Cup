import type { ChartCollectionRepository } from '@/src/application/repositories/chart-collection.repository.interface';
import type {
  ChartCollection,
  CreateChartCollectionInput,
  UpdateChartCollectionInput,
} from '@/src/entities/models/chart-collection';

export interface ChartCollectionUseCases {
  readonly create: (input: CreateChartCollectionInput) => Promise<ChartCollection>;
  readonly update: (id: string, input: UpdateChartCollectionInput) => Promise<ChartCollection>;
  readonly move: (id: string, parentId: string | null) => Promise<ChartCollection>;
  readonly archive: (id: string) => Promise<void>;
}

export const createChartCollectionUseCases = (
  repository: ChartCollectionRepository,
): ChartCollectionUseCases => ({
  create: (input) => repository.create({ ...input, name: input.name.trim() }),
  update: (id, input) => repository.update(id, { ...input, name: input.name?.trim() }),
  move: (id, parentId) => repository.move(id, parentId),
  archive: (id) => repository.archive(id),
});
