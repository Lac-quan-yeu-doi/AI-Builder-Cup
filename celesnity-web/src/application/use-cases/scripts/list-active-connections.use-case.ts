import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';

export type ListActiveConnectionsUseCase = ReturnType<typeof createListActiveConnectionsUseCase>;

export const createListActiveConnectionsUseCase = (repository: ScriptRepository) => () =>
  repository.listActiveConnections();
