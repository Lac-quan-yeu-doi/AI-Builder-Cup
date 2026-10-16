import type { SaveAsNewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/save-as-new-canonical-chart.use-case';
import type { CreateCanonicalChartInput } from '@/src/entities/models/canonical-chart';
import type { CanonicalChartViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { presentCanonicalChart } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type SaveAsNewCanonicalChartController = ReturnType<
  typeof createSaveAsNewCanonicalChartController
>;

export const createSaveAsNewCanonicalChartController =
  (useCase: SaveAsNewCanonicalChartUseCase) =>
  async (input: CreateCanonicalChartInput): Promise<CanonicalChartViewModel> =>
    presentCanonicalChart(await useCase(input));
