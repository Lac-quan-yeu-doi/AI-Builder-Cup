import type { UpdateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/update-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DatabaseServiceUpdateInput } from '@/src/entities/models/database-service';
import {
  presentDatabaseService,
  type DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { updateDatabaseServiceInputSchema } from './database-service.schemas';

export type UpdateDatabaseServiceController = ReturnType<
  typeof createUpdateDatabaseServiceController
>;

export const createUpdateDatabaseServiceController =
  (
    useCase: UpdateDatabaseServiceUseCase,
  ): ((id: string, input: DatabaseServiceUpdateInput) => Promise<DatabaseServiceViewModel>) =>
  async (id, input) => {
    const parsed = updateDatabaseServiceInputSchema.safeParse({ id, input });
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService update', { cause: parsed.error });
    }
    return presentDatabaseService(await useCase(parsed.data.id, parsed.data.input));
  };
