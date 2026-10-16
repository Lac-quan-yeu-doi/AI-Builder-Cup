import type { ScriptId } from '@domain/script-authoring/value-objects/script-value-objects';

export interface IScriptPublicationLock {
  run<T>(scriptId: ScriptId, operation: () => Promise<T>): Promise<T>;
}
