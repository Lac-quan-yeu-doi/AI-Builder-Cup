import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';

export type GetConnectionUseCase = ReturnType<typeof createGetConnectionUseCase>;

export const createGetConnectionUseCase = (repository: ConnectionRepository) => (id: string) =>
  repository.get(id);
