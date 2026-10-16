import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartRevision } from '@/src/entities/models/canonical-chart';

export type ListCanonicalChartRevisionsUseCase = (
  chartId: string,
) => Promise<readonly ChartRevision[]>;

export const createListCanonicalChartRevisionsUseCase =
  (repository: CanonicalChartRepository): ListCanonicalChartRevisionsUseCase =>
  (chartId) => {
    const id = chartId.trim();
    if (!id) throw new Error('Chart id is required.');
    return repository.listRevisions?.(id) ?? Promise.resolve([]);
  };
