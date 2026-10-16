import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type ArchiveDatabaseServiceUseCase = ReturnType<typeof createArchiveDatabaseServiceUseCase>;

export const createArchiveDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) => (id: string) =>
    repository.archive(id);
