import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import type { CreateChartInput, Chart } from '@/src/entities/models/chart';

export type CreateChartUseCase = (input: CreateChartInput) => Promise<Chart>;

export const createCreateChartUseCase =
  (repository: ChartRepository): CreateChartUseCase =>
  (input) => {
    const title = input.title.trim();
    if (!title) throw new Error('Chart title is required.');
    return repository.create({ ...input, title });
  };
