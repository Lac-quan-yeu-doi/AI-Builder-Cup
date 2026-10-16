import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';

export type GetScriptUseCase = ReturnType<typeof createGetScriptUseCase>;

export const createGetScriptUseCase = (repository: ScriptRepository) => (id: string) =>
  repository.getScript(id);
