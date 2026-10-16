import type { RunSavedCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/run-saved-canonical-chart.use-case';
import type { ChartDraft } from '@/src/entities/models/canonical-chart';
import type { ChartPreviewViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { presentChartPreview } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type RunSavedCanonicalChartController = ReturnType<
  typeof createRunSavedCanonicalChartController
>;

export const createRunSavedCanonicalChartController =
  (useCase: RunSavedCanonicalChartUseCase) =>
  async (input: {
    readonly chartId: string;
    readonly parameterValues: ChartDraft['parameterValues'];
  }): Promise<ChartPreviewViewModel> =>
    presentChartPreview(await useCase(input));
