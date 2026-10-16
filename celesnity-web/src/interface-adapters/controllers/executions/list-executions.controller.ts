import type { ListExecutionsUseCase } from '@/src/application/use-cases/executions/list-executions.use-case';
import {
  presentExecutionSummaries,
  type ExecutionSummaryViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

export type ListExecutionsController = ReturnType<typeof createListExecutionsController>;

export const createListExecutionsController =
  (useCase: ListExecutionsUseCase): (() => Promise<readonly ExecutionSummaryViewModel[]>) =>
  async () =>
    presentExecutionSummaries(await useCase());
