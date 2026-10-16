import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type GetDatabaseServiceUseCase = ReturnType<typeof createGetDatabaseServiceUseCase>;

export const createGetDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) => (id: string) =>
    repository.get(id);
