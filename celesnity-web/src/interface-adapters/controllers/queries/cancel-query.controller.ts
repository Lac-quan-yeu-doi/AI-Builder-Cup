import type { CancelQueryUseCase } from '@/src/application/use-cases/queries/cancel-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentQueryResult,
  type SqlExecutionResultViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

import { queryIdSchema } from './query.schemas';

export type CancelQueryController = ReturnType<typeof createCancelQueryController>;

export const createCancelQueryController =
  (useCase: CancelQueryUseCase): ((id: string) => Promise<SqlExecutionResultViewModel>) =>
  async (id) => {
    const parsed = queryIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid query identifier', { cause: parsed.error });
    }
    return presentQueryResult(await useCase(parsed.data));
  };
