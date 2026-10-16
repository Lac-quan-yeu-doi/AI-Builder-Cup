import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';

export type ListScriptsUseCase = ReturnType<typeof createListScriptsUseCase>;

export const createListScriptsUseCase = (repository: ScriptRepository) => () =>
  repository.listScripts();
