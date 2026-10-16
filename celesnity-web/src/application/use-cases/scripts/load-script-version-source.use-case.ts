import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';

export type LoadScriptVersionSourceUseCase = ReturnType<
  typeof createLoadScriptVersionSourceUseCase
>;

export const createLoadScriptVersionSourceUseCase =
  (repository: ScriptRepository) => (scriptId: string, versionNumber: number) =>
    repository.loadVersionSource(scriptId, versionNumber);
