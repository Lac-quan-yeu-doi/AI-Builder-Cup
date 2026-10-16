import type { CancelExecutionUseCase } from '@/src/application/use-cases/executions/cancel-execution.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentExecutionDetail,
  type ExecutionDetailViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

import { executionIdSchema } from './execution.schemas';

export type CancelExecutionController = ReturnType<typeof createCancelExecutionController>;

export const createCancelExecutionController =
  (useCase: CancelExecutionUseCase): ((id: string) => Promise<ExecutionDetailViewModel>) =>
  async (id) => {
    const parsed = executionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid execution identifier', { cause: parsed.error });
    }
    return presentExecutionDetail(await useCase(parsed.data));
  };
