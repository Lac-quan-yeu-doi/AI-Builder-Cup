import { InputParseError } from '@/src/entities/errors/application-errors';
import type { EditableScriptDraft } from '@/src/entities/models/script';

import { editableScriptDraftSchema } from './script.schemas';

export function parseEditableScriptDraft(draft: EditableScriptDraft): EditableScriptDraft {
  const parsed = editableScriptDraftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new InputParseError('Invalid editable script draft', { cause: parsed.error });
  }

  return {
    name: parsed.data.name,
    connectionId: parsed.data.connectionId,
    source: parsed.data.source,
    ...(parsed.data.scriptId !== undefined ? { scriptId: parsed.data.scriptId } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    ...(parsed.data.viewedVersionNumber !== undefined
      ? { viewedVersionNumber: parsed.data.viewedVersionNumber }
      : {}),
  };
}
