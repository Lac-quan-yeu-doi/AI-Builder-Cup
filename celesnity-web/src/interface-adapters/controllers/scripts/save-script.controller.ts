import type { SaveScriptUseCase } from '@/src/application/use-cases/scripts/save-script.use-case';
import type { EditableScriptDraft, Script } from '@/src/entities/models/script';
import {
  presentSaveScriptResult,
  type SaveScriptResultViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

import { parseEditableScriptDraft } from './parse-editable-script-draft';

export type SaveScriptController = ReturnType<typeof createSaveScriptController>;

export const createSaveScriptController =
  (
    useCase: SaveScriptUseCase,
  ): ((
    draft: EditableScriptDraft,
    persistedScript?: Script,
  ) => Promise<SaveScriptResultViewModel>) =>
  async (draft, persistedScript) => {
    const parsedDraft = parseEditableScriptDraft(draft);
    return presentSaveScriptResult(await useCase(parsedDraft, persistedScript));
  };
