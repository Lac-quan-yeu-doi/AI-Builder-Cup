import { errorMessage } from '@/app/_components/shared/error-message';
import { ScriptPublishError, ScriptRunError } from '@/src/entities/errors/application-errors';
import type { SaveScriptResult, Script } from '@/src/entities/models/script';

const ERROR_FALLBACK = 'Check the Core API and try again.';

export type ScriptSaveFailure =
  | {
      readonly kind: 'run';
      readonly saved: SaveScriptResult;
      readonly message: string;
    }
  | {
      readonly kind: 'publish';
      readonly persistedScript: Script;
      readonly message: string;
    }
  | { readonly kind: 'other'; readonly message: string };

export function describeScriptSaveFailure(error: unknown): ScriptSaveFailure {
  if (error instanceof ScriptRunError) {
    return {
      kind: 'run',
      saved: error.saved,
      message: `Version ${error.saved.version.versionNumber} was saved, but its execution could not start. ${errorMessage(error.reason, ERROR_FALLBACK)}`,
    };
  }
  if (error instanceof ScriptPublishError) {
    return {
      kind: 'publish',
      persistedScript: error.persistedScript,
      message: `Metadata was saved, but the source version could not be published. ${errorMessage(error.reason, ERROR_FALLBACK)}`,
    };
  }
  return {
    kind: 'other',
    message: `The script could not be saved. ${errorMessage(error, ERROR_FALLBACK)}`,
  };
}
