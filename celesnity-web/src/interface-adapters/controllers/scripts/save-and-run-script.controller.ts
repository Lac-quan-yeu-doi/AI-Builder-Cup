import type { SaveAndRunScriptUseCase } from '@/src/application/use-cases/scripts/save-and-run-script.use-case';
import type { EditableScriptDraft, Script } from '@/src/entities/models/script';
import {
  presentSaveAndRunScriptResult,
  type SaveAndRunScriptResultViewModel,
} from '@/src/interface-adapters/presenters/script.presenter';

import { parseEditableScriptDraft } from './parse-editable-script-draft';

export type SaveAndRunScriptController = ReturnType<typeof createSaveAndRunScriptController>;

export const createSaveAndRunScriptController =
  (
    useCase: SaveAndRunScriptUseCase,
  ): ((
    draft: EditableScriptDraft,
    persistedScript?: Script,
  ) => Promise<SaveAndRunScriptResultViewModel>) =>
  async (draft, persistedScript) => {
    const parsedDraft = parseEditableScriptDraft(draft);
    return presentSaveAndRunScriptResult(await useCase(parsedDraft, persistedScript));
  };
