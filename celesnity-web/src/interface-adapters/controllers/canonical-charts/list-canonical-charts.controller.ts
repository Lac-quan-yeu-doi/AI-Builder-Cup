import type { ListCanonicalChartsUseCase } from '@/src/application/use-cases/canonical-charts/list-canonical-charts.use-case';
import type { ChartSummary } from '@/src/entities/models/canonical-chart';

export type ListCanonicalChartsController = ReturnType<typeof createListCanonicalChartsController>;

export const createListCanonicalChartsController =
  (useCase: ListCanonicalChartsUseCase) =>
  (collectionId?: string): Promise<readonly ChartSummary[]> =>
    useCase(collectionId);
