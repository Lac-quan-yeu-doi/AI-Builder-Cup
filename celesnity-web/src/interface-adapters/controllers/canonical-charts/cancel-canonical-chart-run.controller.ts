import type { CancelCanonicalChartRunUseCase } from '@/src/application/use-cases/canonical-charts/cancel-canonical-chart-run.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

export type CancelCanonicalChartRunController = ReturnType<
  typeof createCancelCanonicalChartRunController
>;

export const createCancelCanonicalChartRunController =
  (useCase: CancelCanonicalChartRunUseCase) =>
  async (input: { readonly chartId: string; readonly runId: string }): Promise<void> => {
    if (!input || !input.chartId?.trim() || !input.runId?.trim()) {
      throw new InputParseError('Chart id and run id are required.');
    }
    await useCase({ chartId: input.chartId.trim(), runId: input.runId.trim() });
  };
