import type { SubmitQueryUseCase } from '@/src/application/use-cases/queries/submit-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { QueryEditorSession } from '@/src/entities/models/query';
import {
  presentQueryAccepted,
  type SqlExecutionAcceptedViewModel,
} from '@/src/interface-adapters/presenters/query.presenter';

import { querySessionSchema } from './query.schemas';

export type SubmitQueryController = ReturnType<typeof createSubmitQueryController>;

export const createSubmitQueryController =
  (
    useCase: SubmitQueryUseCase,
  ): ((session: QueryEditorSession) => Promise<SqlExecutionAcceptedViewModel>) =>
  async (session) => {
    const parsed = querySessionSchema.safeParse(session);
    if (!parsed.success) {
      throw new InputParseError('Invalid query session', { cause: parsed.error });
    }
    return presentQueryAccepted(await useCase(parsed.data));
  };
