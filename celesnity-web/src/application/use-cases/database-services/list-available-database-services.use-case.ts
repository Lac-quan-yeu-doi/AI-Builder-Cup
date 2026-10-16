import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type {
  DatabaseServiceListPage,
  DatabaseServiceListQuery,
} from '@/src/entities/models/database-service';

export type ListAvailableDatabaseServicesUseCase = ReturnType<
  typeof createListAvailableDatabaseServicesUseCase
>;

export const createListAvailableDatabaseServicesUseCase =
  (repository: DatabaseServiceRepository) =>
  (
    query: DatabaseServiceListQuery & { readonly databaseName: string },
  ): Promise<DatabaseServiceListPage> =>
    repository.listAvailable(query);
