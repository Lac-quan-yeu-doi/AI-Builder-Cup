import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import { ScriptRunError } from '@/src/entities/errors/application-errors';
import type {
  EditableScriptDraft,
  SaveAndRunScriptResult,
  Script,
} from '@/src/entities/models/script';

import { persistScriptDraft } from './persist-script-draft';

export type SaveAndRunScriptUseCase = ReturnType<typeof createSaveAndRunScriptUseCase>;

export const createSaveAndRunScriptUseCase =
  (repository: ScriptRepository) =>
  async (draft: EditableScriptDraft, persistedScript?: Script): Promise<SaveAndRunScriptResult> => {
    const saved = await persistScriptDraft(repository, draft, persistedScript);

    try {
      const run = await repository.runVersion(saved.script.id, saved.version.versionNumber);
      return { saved, run };
    } catch (error) {
      throw new ScriptRunError(saved, error);
    }
  };
