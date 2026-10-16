import type { GetExecutionUseCase } from '@/src/application/use-cases/executions/get-execution.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentExecutionDetail,
  type ExecutionDetailViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

import { executionIdSchema } from './execution.schemas';

export type GetExecutionController = ReturnType<typeof createGetExecutionController>;

export const createGetExecutionController =
  (useCase: GetExecutionUseCase): ((id: string) => Promise<ExecutionDetailViewModel>) =>
  async (id) => {
    const parsed = executionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid execution identifier', { cause: parsed.error });
    }
    return presentExecutionDetail(await useCase(parsed.data));
  };
