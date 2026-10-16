import type {
  RestoreCanonicalChartRevisionInput,
  RestoreCanonicalChartRevisionUseCase,
} from '@/src/application/use-cases/canonical-charts/restore-canonical-chart-revision.use-case';
import type { CanonicalChartViewModel } from '@/src/interface-adapters/presenters/canonical-chart.presenter';
import { presentCanonicalChart } from '@/src/interface-adapters/presenters/canonical-chart.presenter';

export type RestoreCanonicalChartRevisionController = ReturnType<
  typeof createRestoreCanonicalChartRevisionController
>;

export const createRestoreCanonicalChartRevisionController =
  (useCase: RestoreCanonicalChartRevisionUseCase) =>
  async (input: RestoreCanonicalChartRevisionInput): Promise<CanonicalChartViewModel> =>
    presentCanonicalChart(await useCase(input));
