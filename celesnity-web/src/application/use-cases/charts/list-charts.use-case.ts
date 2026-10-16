import type { Chart } from '@/src/entities/models/chart';
import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';

export type ListChartsUseCase = () => Promise<readonly Chart[]>;

export const createListChartsUseCase =
  (repository: ChartRepository): ListChartsUseCase =>
  (): Promise<readonly Chart[]> => {
    return repository.list();
  };
