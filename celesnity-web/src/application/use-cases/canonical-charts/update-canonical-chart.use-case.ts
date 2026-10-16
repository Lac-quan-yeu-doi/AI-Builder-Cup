import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type {
  CanonicalChart,
  CreateCanonicalChartInput,
} from '@/src/entities/models/canonical-chart';

export interface UpdateCanonicalChartInput extends CreateCanonicalChartInput {
  readonly chartId: string;
  readonly expectedRevision: number;
}

export type UpdateCanonicalChartUseCase = (
  input: UpdateCanonicalChartInput,
) => Promise<CanonicalChart>;

export const createUpdateCanonicalChartUseCase =
  (repository: CanonicalChartRepository): UpdateCanonicalChartUseCase =>
  (input) => {
    const title = input.title.trim();
    if (!title) throw new Error('Chart title is required.');
    if (!repository.update) throw new Error('Chart updates are unavailable.');
    return repository.update({ ...input, title });
  };
