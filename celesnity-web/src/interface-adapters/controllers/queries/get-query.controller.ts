import type { GetQueryUseCase } from '@/src/application/use-cases/queries/get-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentQueryResult,
  type SqlExecutionResultViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

import { queryIdSchema } from './query.schemas';

export type GetQueryController = ReturnType<typeof createGetQueryController>;

export const createGetQueryController =
  (useCase: GetQueryUseCase): ((id: string) => Promise<SqlExecutionResultViewModel>) =>
  async (id) => {
    const parsed = queryIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid query identifier', { cause: parsed.error });
    }
    return presentQueryResult(await useCase(parsed.data));
  };
