import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';

export type ListCanonicalChartsUseCase = (
  collectionId?: string,
) => Promise<readonly ChartSummary[]>;

export const createListCanonicalChartsUseCase =
  (repository: CanonicalChartRepository): ListCanonicalChartsUseCase =>
  (collectionId) =>
    repository.list?.(collectionId) ?? Promise.resolve([]);
