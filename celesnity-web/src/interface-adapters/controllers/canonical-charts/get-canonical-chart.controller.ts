import type { GetCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/get-canonical-chart.use-case';
import type { CanonicalChartViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { presentCanonicalChart } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type GetCanonicalChartController = ReturnType<typeof createGetCanonicalChartController>;

export const createGetCanonicalChartController =
  (useCase: GetCanonicalChartUseCase) =>
  async (chartId: string): Promise<CanonicalChartViewModel> =>
    presentCanonicalChart(await useCase(chartId));
