import type { ScriptRepository } from '@/src/application/repositories/script.repository.interface';
import { ScriptPublishError } from '@/src/entities/errors/application-errors';
import type {
  EditableScriptDraft,
  SaveScriptResult,
  Script,
  ScriptMetadata,
} from '@/src/entities/models/script';

export async function persistScriptDraft(
  repository: ScriptRepository,
  draft: EditableScriptDraft,
  persistedScript?: Script,
): Promise<SaveScriptResult> {
  assertDraftIdentity(draft, persistedScript);
  const metadata = normalizeMetadata(draft);
  let script: Script;

  if (!persistedScript) {
    script = await repository.createScript(metadata);
  } else if (metadataChanged(metadata, persistedScript)) {
    script = await repository.updateScriptMetadata(persistedScript.id, metadata);
  } else {
    script = persistedScript;
  }

  try {
    const version = await repository.publishVersion(script.id, draft.source);
    return {
      script: {
        ...script,
        currentVersion: version,
        updatedAt: version.publishedAt,
      },
      version,
    };
  } catch (error) {
    throw new ScriptPublishError(script, error);
  }
}

function assertDraftIdentity(draft: EditableScriptDraft, persistedScript?: Script): void {
  if (draft.scriptId && draft.scriptId !== persistedScript?.id) {
    throw new Error('The editable draft no longer matches the loaded script.');
  }
  if (!draft.scriptId && persistedScript) {
    throw new Error('A new draft cannot overwrite an existing script.');
  }
}

function normalizeMetadata(draft: EditableScriptDraft): ScriptMetadata {
  const name = draft.name.trim();
  const description = draft.description?.trim();

  return {
    name,
    connectionId: draft.connectionId.trim(),
    ...(description ? { description } : {}),
  };
}

function metadataChanged(metadata: ScriptMetadata, script: Script): boolean {
  return (
    metadata.name !== script.name ||
    (metadata.description ?? '') !== (script.description ?? '') ||
    metadata.connectionId !== script.connectionId
  );
}
