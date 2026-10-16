import type { CreateDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/create-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DatabaseServiceInput } from '@/src/entities/models/database-service';
import {
  presentDatabaseService,
  type DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { databaseServiceInputSchema } from './database-service.schemas';

export type CreateDatabaseServiceController = ReturnType<
  typeof createCreateDatabaseServiceController
>;

export const createCreateDatabaseServiceController =
  (
    useCase: CreateDatabaseServiceUseCase,
  ): ((input: DatabaseServiceInput) => Promise<DatabaseServiceViewModel>) =>
  async (input) => {
    const parsed = databaseServiceInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService input', { cause: parsed.error });
    }
    return presentDatabaseService(await useCase(parsed.data));
  };
