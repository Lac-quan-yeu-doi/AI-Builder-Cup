import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';

export type TestSavedConnectionUseCase = ReturnType<typeof createTestSavedConnectionUseCase>;

export const createTestSavedConnectionUseCase =
  (repository: ConnectionRepository) => (id: string) =>
    repository.testSaved(id);
