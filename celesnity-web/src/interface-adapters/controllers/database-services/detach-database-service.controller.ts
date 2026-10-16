import type { DetachDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/detach-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { databaseServiceIdSchema, databaseNameSchema } from './database-service.schemas';

export type DetachDatabaseServiceController = ReturnType<
  typeof createDetachDatabaseServiceController
>;

export const createDetachDatabaseServiceController =
  (useCase: DetachDatabaseServiceUseCase) =>
  async (id: string, databaseName: string): Promise<void> => {
    const parsedId = databaseServiceIdSchema.safeParse(id);
    const parsedDatabase = databaseNameSchema.safeParse(databaseName);
    if (!parsedId.success || !parsedDatabase.success) {
      throw new InputParseError('Invalid datasource membership', {
        cause: parsedId.success ? parsedDatabase.error : parsedId.error,
      });
    }
    await useCase(parsedId.data, parsedDatabase.data);
  };
