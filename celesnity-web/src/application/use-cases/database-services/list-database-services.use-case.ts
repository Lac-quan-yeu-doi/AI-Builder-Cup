import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { DatabaseServiceListQuery } from '@/src/entities/models/database-service';

export type ListDatabaseServicesUseCase = ReturnType<typeof createListDatabaseServicesUseCase>;

export const createListDatabaseServicesUseCase =
  (repository: DatabaseServiceRepository) => (query?: DatabaseServiceListQuery) =>
    repository.list(query);
