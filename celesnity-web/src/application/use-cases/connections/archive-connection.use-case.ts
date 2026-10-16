import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';

export type ArchiveConnectionUseCase = ReturnType<typeof createArchiveConnectionUseCase>;

export const createArchiveConnectionUseCase = (repository: ConnectionRepository) => (id: string) =>
  repository.archive(id);
