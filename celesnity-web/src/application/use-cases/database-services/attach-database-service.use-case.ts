import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type AttachDatabaseServiceUseCase = ReturnType<typeof createAttachDatabaseServiceUseCase>;

export const createAttachDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) =>
  (id: string, databaseName: string): Promise<void> =>
    repository.attach(id, databaseName);
