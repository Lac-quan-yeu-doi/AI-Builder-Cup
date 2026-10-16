import type { GetDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/get-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentDatabaseService,
  type DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { databaseServiceIdSchema } from './database-service.schemas';

export type GetDatabaseServiceController = ReturnType<typeof createGetDatabaseServiceController>;

export const createGetDatabaseServiceController =
  (useCase: GetDatabaseServiceUseCase): ((id: string) => Promise<DatabaseServiceViewModel>) =>
  async (id) => {
    const parsed = databaseServiceIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService id', { cause: parsed.error });
    }
    return presentDatabaseService(await useCase(parsed.data));
  };
