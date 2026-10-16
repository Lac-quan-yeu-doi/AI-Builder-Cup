import type { CreateConnectionUseCase } from '@/src/application/use-cases/connections/create-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DataConnectionInput } from '@/src/entities/models/connection';
import {
  presentConnection,
  type ConnectionViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

import { dataConnectionInputSchema } from './connection.schemas';

export type CreateConnectionController = ReturnType<typeof createCreateConnectionController>;

export const createCreateConnectionController =
  (
    useCase: CreateConnectionUseCase,
  ): ((input: DataConnectionInput) => Promise<ConnectionViewModel>) =>
  async (input) => {
    const parsed = dataConnectionInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid connection input', { cause: parsed.error });
    }
    return presentConnection(await useCase(parsed.data));
  };
