import type {
  ChartCollection,
  ChartCollectionRepository as ChartCollectionRepositoryPort,
  CreateChartCollectionInput,
  UpdateChartCollectionInput,
} from '@/src/entities/models/chart-collection';

/** Collection persistence port; the adapter owns HTTP and authentication. */
export interface ChartCollectionRepository extends ChartCollectionRepositoryPort {
  list(): Promise<readonly ChartCollection[]>;
  create(input: CreateChartCollectionInput): Promise<ChartCollection>;
  update(id: string, input: UpdateChartCollectionInput): Promise<ChartCollection>;
}
