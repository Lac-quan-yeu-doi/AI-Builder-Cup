import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import type { Chart } from '@/src/entities/models/chart';

export interface SetChartDataFromCsvCommand {
  readonly id: string;
  readonly expectedVersion: number;
  readonly file: File;
}

export type SetChartDataFromCsvUseCase = (command: SetChartDataFromCsvCommand) => Promise<Chart>;

export const createSetChartDataFromCsvUseCase =
  (repository: ChartRepository): SetChartDataFromCsvUseCase =>
  (command: SetChartDataFromCsvCommand): Promise<Chart> => {
    return repository.setDataFromCsv(command.id, command.file, command.expectedVersion);
  };
