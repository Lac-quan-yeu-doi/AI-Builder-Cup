import type { UpdateConnectionUseCase } from '@/src/application/use-cases/connections/update-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DataConnectionInput } from '@/src/entities/models/connection';
import {
  presentConnection,
  type ConnectionViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

import { updateConnectionInputSchema } from './connection.schemas';

export type UpdateConnectionController = ReturnType<typeof createUpdateConnectionController>;

export const createUpdateConnectionController =
  (
    useCase: UpdateConnectionUseCase,
  ): ((id: string, input: DataConnectionInput) => Promise<ConnectionViewModel>) =>
  async (id, input) => {
    const parsed = updateConnectionInputSchema.safeParse({ id, input });
    if (!parsed.success) {
      throw new InputParseError('Invalid connection update', { cause: parsed.error });
    }
    return presentConnection(await useCase(parsed.data.id, parsed.data.input));
  };
