import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import type { ScriptVersion } from '@/src/entities/models/script';

export type ListScriptVersionsUseCase = ReturnType<typeof createListScriptVersionsUseCase>;

export const createListScriptVersionsUseCase =
  (repository: ScriptRepository) =>
  async (scriptId: string): Promise<readonly ScriptVersion[]> => {
    const versions = await repository.listVersions(scriptId);
    return [...versions].sort((left, right) => right.versionNumber - left.versionNumber);
  };
