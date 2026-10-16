import type { UpdateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/update-canonical-chart.use-case';
import type { UpdateCanonicalChartInput } from '@/src/application/use-cases/canonical-charts/update-canonical-chart.use-case';
import type { CanonicalChartViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { presentCanonicalChart } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type UpdateCanonicalChartController = ReturnType<
  typeof createUpdateCanonicalChartController
>;

export const createUpdateCanonicalChartController =
  (useCase: UpdateCanonicalChartUseCase) =>
  async (input: UpdateCanonicalChartInput): Promise<CanonicalChartViewModel> =>
    presentCanonicalChart(await useCase(input));
