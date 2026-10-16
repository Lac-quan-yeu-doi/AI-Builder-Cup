import type { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import type {
  ScriptId,
  ScriptVersionId,
} from '@domain/script-authoring/value-objects/script-value-objects';

export interface PublishScriptVersionRequest {
  readonly scriptId: ScriptId;
  readonly version: ScriptVersion;
  readonly expectedCurrentVersionId?: ScriptVersionId;
  readonly expectedRevision: number;
  readonly revision: number;
}

export interface PersistedScriptVersion {
  readonly id: string;
  readonly scriptId: string;
  readonly versionNumber: number;
  readonly artifactBucket: string;
  readonly objectKey: string;
  readonly objectVersionId: string;
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly publishedAt: Date;
  readonly currentVersionId: string | null;
  readonly revision: number;
}

export interface IScriptVersionRepository {
  /**
   * Inserts the new version and advances the script to point at it. Must run
   * inside a unit of work; the guard pins both the revision and the version being
   * advanced from, so two concurrent publishes cannot both succeed.
   */
  publish(request: PublishScriptVersionRequest): Promise<void>;

  findById(id: ScriptVersionId): Promise<PersistedScriptVersion | undefined>;
}
