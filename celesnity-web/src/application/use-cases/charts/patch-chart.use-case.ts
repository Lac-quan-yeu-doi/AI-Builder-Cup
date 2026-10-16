import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import type { Chart, PatchChartInput } from '@/src/entities/models/chart';

export interface PatchChartCommand {
  readonly id: string;
  readonly expectedVersion: number;
  readonly patch: PatchChartInput;
}

export type PatchChartUseCase = (command: PatchChartCommand) => Promise<Chart>;

export const createPatchChartUseCase =
  (repository: ChartRepository): PatchChartUseCase =>
  ({ id, expectedVersion, patch }) => {
    const normalized = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
    return repository.patch(id, normalized, expectedVersion);
  };
