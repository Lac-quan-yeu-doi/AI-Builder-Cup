import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';

export interface DeleteChartCommand {
  readonly id: string;
  readonly expectedVersion: number;
}

export type DeleteChartUseCase = (command: DeleteChartCommand) => Promise<void>;

export const createDeleteChartUseCase =
  (repository: ChartRepository): DeleteChartUseCase =>
  (command) =>
    repository.delete(command.id, command.expectedVersion);
