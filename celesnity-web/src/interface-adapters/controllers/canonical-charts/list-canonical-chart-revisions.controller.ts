import type { ListCanonicalChartRevisionsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-chart-revisions.use-case';
import type { ChartRevision } from '@/src/entities/models/canonical-chart';

export type ListCanonicalChartRevisionsController = ReturnType<
  typeof createListCanonicalChartRevisionsController
>;

export const createListCanonicalChartRevisionsController =
  (useCase: ListCanonicalChartRevisionsUseCase) =>
  (chartId: string): Promise<readonly ChartRevision[]> =>
    useCase(chartId);
