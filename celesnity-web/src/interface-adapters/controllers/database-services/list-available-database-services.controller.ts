import type { ListAvailableDatabaseServicesUseCase } from '@/src/application/use-cases/database-services/list-available-database-services.use-case';
import type { DatabaseServiceListQuery } from '@/src/entities/models/database-service';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentDatabaseServicePage,
  type DatabaseServiceViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { databaseNameSchema } from './database-service.schemas';

export type ListAvailableDatabaseServicesController = ReturnType<
  typeof createListAvailableDatabaseServicesController
>;

export const createListAvailableDatabaseServicesController =
  (useCase: ListAvailableDatabaseServicesUseCase) =>
  async (
    query: DatabaseServiceListQuery & { readonly databaseName: string },
  ): Promise<{
    readonly items: readonly DatabaseServiceViewModel[];
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  }> => {
    const parsedDatabase = databaseNameSchema.safeParse(query.databaseName);
    if (!parsedDatabase.success) {
      throw new InputParseError('Invalid membership database name', {
        cause: parsedDatabase.error,
      });
    }
    return presentDatabaseServicePage(
      await useCase({ ...query, databaseName: parsedDatabase.data }),
    );
  };
