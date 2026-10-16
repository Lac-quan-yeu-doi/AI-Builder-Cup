import type { Chart, CreateChartInput, PatchChartInput } from '@/src/entities/models/chart';

export interface ChartRepository {
  list(): Promise<readonly Chart[]>;
  create(input: CreateChartInput): Promise<Chart>;
  patch(id: string, input: PatchChartInput, expectedVersion: number): Promise<Chart>;
  delete(id: string, expectedVersion: number): Promise<void>;
  setDataFromCsv(id: string, file: File, expectedVersion: number): Promise<Chart>;
}
