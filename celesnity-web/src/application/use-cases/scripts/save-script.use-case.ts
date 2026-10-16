import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import type { EditableScriptDraft, Script } from '@/src/entities/models/script';

import { persistScriptDraft } from './persist-script-draft';

export type SaveScriptUseCase = ReturnType<typeof createSaveScriptUseCase>;

export const createSaveScriptUseCase =
  (repository: ScriptRepository) => (draft: EditableScriptDraft, persistedScript?: Script) =>
    persistScriptDraft(repository, draft, persistedScript);
