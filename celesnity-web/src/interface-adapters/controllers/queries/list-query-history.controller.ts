import type { ListQueryHistoryUseCase } from '@/src/application/use-cases/queries/list-query-history.use-case';
import {
  presentQuerySummaries,
  type SqlExecutionSummaryViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

export type ListQueryHistoryController = ReturnType<typeof createListQueryHistoryController>;

export const createListQueryHistoryController =
  (useCase: ListQueryHistoryUseCase): (() => Promise<readonly SqlExecutionSummaryViewModel[]>) =>
  async () =>
    presentQuerySummaries(await useCase());
