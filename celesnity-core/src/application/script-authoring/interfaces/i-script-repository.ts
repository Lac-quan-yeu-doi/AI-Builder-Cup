import type { Script } from '@domain/script-authoring/aggregates/script';
import type { ScriptId } from '@domain/script-authoring/value-objects/script-value-objects';

export interface IScriptRepository {
  findById(id: ScriptId): Promise<Script | undefined>;
}
