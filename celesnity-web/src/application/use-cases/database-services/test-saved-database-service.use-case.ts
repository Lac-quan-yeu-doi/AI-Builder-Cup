import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';

export type TestSavedDatabaseServiceUseCase = ReturnType<
  typeof createTestSavedDatabaseServiceUseCase
>;

export const createTestSavedDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) => (id: string) =>
    repository.testSaved(id);
