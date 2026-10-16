import type { GetConnectionUseCase } from '@/src/application/use-cases/connections/get-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentConnection,
  type ConnectionViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

import { connectionIdSchema } from './connection.schemas';

export type GetConnectionController = ReturnType<typeof createGetConnectionController>;

export const createGetConnectionController =
  (useCase: GetConnectionUseCase): ((id: string) => Promise<ConnectionViewModel>) =>
  async (id) => {
    const parsed = connectionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid connection id', { cause: parsed.error });
    }
    return presentConnection(await useCase(parsed.data));
  };
