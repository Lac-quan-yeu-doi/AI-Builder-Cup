import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type DetachDatabaseServiceUseCase = ReturnType<typeof createDetachDatabaseServiceUseCase>;

export const createDetachDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) =>
  (id: string, databaseName: string): Promise<void> =>
    repository.detach(id, databaseName);
