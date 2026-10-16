import type { Script } from '@domain/script-authoring/aggregates/script';

/**
 * Write port for script metadata. Both methods must run inside a unit of work:
 * the row and the domain events it produces commit together. The transaction is
 * ambient, so it is not a parameter here.
 */
export interface IScriptMetadataRepository {
  create(script: Script): Promise<void>;

  /**
   * Applies a metadata change, guarded by the revision the aggregate was loaded
   * at. Raises a metadata conflict when another writer moved the script on.
   */
  update(script: Script, expectedRevision: number): Promise<void>;
}
