import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { CanonicalChart } from '@/src/entities/models/canonical-chart';

export type GetCanonicalChartUseCase = (chartId: string) => Promise<CanonicalChart>;

export const createGetCanonicalChartUseCase =
  (repository: CanonicalChartRepository): GetCanonicalChartUseCase =>
  (chartId) => {
    const id = chartId.trim();
    if (!id) throw new Error('Chart id is required.');
    return repository.get(id);
  };
