import type { GetExecutionLogsUseCase } from '@/src/application/use-cases/executions/get-execution-logs.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentExecutionLog,
  type ExecutionLogViewModel,
} from '@/src/interface-adapters/presenters/execution.presenter';

import { executionIdSchema } from './execution.schemas';

export type GetExecutionLogsController = ReturnType<typeof createGetExecutionLogsController>;

export const createGetExecutionLogsController =
  (
    useCase: GetExecutionLogsUseCase,
  ): ((id: string) => Promise<ExecutionLogViewModel | undefined>) =>
  async (id) => {
    const parsed = executionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid execution identifier', { cause: parsed.error });
    }
    const log = await useCase(parsed.data);
    return log ? presentExecutionLog(log) : undefined;
  };
