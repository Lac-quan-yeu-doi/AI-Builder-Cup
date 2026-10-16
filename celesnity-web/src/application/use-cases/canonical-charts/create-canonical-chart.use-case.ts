import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type {
  CanonicalChart,
  CreateCanonicalChartInput,
} from '@/src/entities/models/canonical-chart';

export type CreateCanonicalChartUseCase = (
  input: CreateCanonicalChartInput,
) => Promise<CanonicalChart>;

export const createCreateCanonicalChartUseCase =
  (repository: CanonicalChartRepository): CreateCanonicalChartUseCase =>
  (input) => {
    const title = input.title.trim();
    if (!title) throw new Error('Chart title is required.');
    return repository.create({ ...input, title });
  };
