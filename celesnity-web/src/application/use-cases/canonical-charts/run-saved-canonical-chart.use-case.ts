import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartDraft, ChartPreview } from '@/src/entities/models/canonical-chart';

export interface RunSavedCanonicalChartInput {
  readonly chartId: string;
  readonly parameterValues: ChartDraft['parameterValues'];
}

export type RunSavedCanonicalChartUseCase = (
  input: RunSavedCanonicalChartInput,
) => Promise<ChartPreview>;

export const createRunSavedCanonicalChartUseCase =
  (repository: CanonicalChartRepository): RunSavedCanonicalChartUseCase =>
  (input) => {
    const chartId = input.chartId.trim();
    if (!chartId) throw new Error('Chart id is required.');
    return repository.runSaved(chartId, input.parameterValues);
  };
