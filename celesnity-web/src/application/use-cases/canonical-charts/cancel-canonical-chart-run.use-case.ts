import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';

export interface CancelCanonicalChartRunInput {
  readonly chartId: string;
  readonly runId: string;
}

export type CancelCanonicalChartRunUseCase = ReturnType<
  typeof createCancelCanonicalChartRunUseCase
>;

export const createCancelCanonicalChartRunUseCase =
  (repository: CanonicalChartRepository) =>
  async (input: CancelCanonicalChartRunInput): Promise<void> => {
    const chartId = input.chartId.trim();
    const runId = input.runId.trim();
    if (!chartId || !runId) throw new Error('Chart id and run id are required.');
    if (!repository.cancelRun) throw new Error('Chart run cancellation is unavailable.');
    await repository.cancelRun({ chartId, runId });
  };
