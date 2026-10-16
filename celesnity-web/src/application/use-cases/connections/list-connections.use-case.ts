import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';

export type ListConnectionsUseCase = ReturnType<typeof createListConnectionsUseCase>;

export const createListConnectionsUseCase = (repository: ConnectionRepository) => () =>
  repository.list();
