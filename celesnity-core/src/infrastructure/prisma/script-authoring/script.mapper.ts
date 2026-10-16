import { Injectable } from '@nestjs/common';

import { ScriptStatus } from '@generated/prisma/enums';
import type { ScriptGetPayload, ScriptModel, ScriptSelect } from '@generated/prisma/models/Script';
import type {
  ScriptVersionGetPayload,
  ScriptVersionSelect,
} from '@generated/prisma/models/ScriptVersion';
import { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import { ScriptMessage } from '@domain/script-authoring/errors/script.messages';
import {
  ArtifactLocation,
  ArtifactVersionId,
  ScriptDescription,
  ScriptId,
  ScriptName,
  ScriptVersionId,
  SourceHash,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import { ArtifactError } from '@application/script-authoring/errors/artifact.error';

/** The script-version columns this mapper reads. */
export const SCRIPT_VERSION_SELECTION = {
  id: true,
  scriptId: true,
  versionNumber: true,
  objectKey: true,
  objectVersionId: true,
  contentSha256: true,
  contentSize: true,
  publishedAt: true,
} as const satisfies ScriptVersionSelect;

/** The script columns this mapper reads, with the current version joined in. */
export const SCRIPT_SELECTION = {
  id: true,
  name: true,
  description: true,
  databaseServiceId: true,
  artifactBucket: true,
  artifactPrefix: true,
  status: true,
  revision: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: { select: SCRIPT_VERSION_SELECTION },
} as const satisfies ScriptSelect;

/** The row shape {@link SCRIPT_VERSION_SELECTION} produces, derived from the schema. */
export type ScriptVersionRecord = ScriptVersionGetPayload<{
  select: typeof SCRIPT_VERSION_SELECTION;
}>;

/** The row shape {@link SCRIPT_SELECTION} produces, derived from the schema. */
export type ScriptRecord = ScriptGetPayload<{ select: typeof SCRIPT_SELECTION }>;

/**
 * Every mutable column of a script row, derived from the generated model so the
 * column set follows `schema.prisma`. Identity columns are dropped because they
 * are only ever supplied on insert, and `currentVersionId` because the
 * publication path owns it.
 */
export type ScriptPersistenceValues = Omit<
  ScriptModel,
  'id' | 'organizationId' | 'createdAt' | 'currentVersionId'
>;

/**
 * Translates between the {@link Script} aggregate and its row, including the
 * joined current {@link ScriptVersion}.
 *
 * Archival is stored twice, as a `status` enum and an `archivedAt` timestamp,
 * so the two are checked against each other on the way in: a row that claims
 * one and not the other is rejected rather than silently rehydrated into an
 * aggregate whose own invariant would then be violated.
 *
 * A version's bucket is not stored on the version row; it belongs to the owning
 * script, which is why version mapping needs it passed in.
 */
@Injectable()
export class ScriptMapper {
  /** Rebuilds the aggregate from a persisted row. */
  public toDomain(record: ScriptRecord): Script {
    if ((record.status === ScriptStatus.ARCHIVED) !== (record.archivedAt !== null)) {
      throw ScriptError.validation(ScriptMessage.archiveStateInconsistent);
    }

    return Script.rehydrate({
      id: ScriptId.from(record.id),
      name: ScriptName.create(record.name),
      description: ScriptDescription.create(record.description),
      connectionId: record.databaseServiceId,
      artifactBucket: record.artifactBucket,
      artifactPrefix: record.artifactPrefix,
      revision: record.revision,
      currentVersion:
        record.currentVersion === null
          ? undefined
          : this.toVersion(record.currentVersion, record.artifactBucket),
      archivedAt: record.archivedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  /** Projects the aggregate onto the mutable columns of its row. */
  public toPersistence(script: Script): ScriptPersistenceValues {
    return {
      name: script.name.value,
      description: script.description.value ?? null,
      databaseServiceId: script.connectionId,
      artifactBucket: script.artifactBucket,
      artifactPrefix: script.artifactPrefix,
      status: script.isArchived ? ScriptStatus.ARCHIVED : ScriptStatus.ACTIVE,
      revision: script.revision,
      archivedAt: script.archivedAt ?? null,
      updatedAt: script.updatedAt,
    };
  }

  /**
   * Rebuilds a published version. The object version id is mandatory: without
   * it the stored artifact cannot be addressed immutably, so a row missing or
   * malforming it is an integrity fault rather than a validation error.
   */
  public toVersion(record: ScriptVersionRecord, bucket: string): ScriptVersion {
    let artifactVersionId: ArtifactVersionId;
    try {
      artifactVersionId = ArtifactVersionId.create(record.objectVersionId);
    } catch {
      throw ArtifactError.integrity();
    }
    return ScriptVersion.rehydrate({
      id: ScriptVersionId.from(record.id),
      scriptId: ScriptId.from(record.scriptId),
      versionNumber: VersionNumber.create(record.versionNumber),
      artifactLocation: ArtifactLocation.create(bucket, record.objectKey),
      artifactVersionId,
      sourceHash: SourceHash.fromSha256(record.contentSha256),
      contentSize: record.contentSize,
      publishedAt: record.publishedAt,
    });
  }
}
