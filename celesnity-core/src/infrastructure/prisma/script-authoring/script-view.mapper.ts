import { Injectable } from '@nestjs/common';

import { ScriptStatus } from '@generated/prisma/enums';
import type { ScriptGetPayload, ScriptSelect } from '@generated/prisma/models/Script';
import type {
  ScriptVersionGetPayload,
  ScriptVersionSelect,
} from '@generated/prisma/models/ScriptVersion';
import type {
  PublishedScriptRecord,
  ScriptVersionView,
  ScriptView,
} from '@application/script-authoring/interfaces/i-script-reader';

/** Version columns a view needs. Excludes `objectVersionId`, which only the publish path exposes. */
export const VERSION_VIEW_SELECTION = {
  id: true,
  scriptId: true,
  versionNumber: true,
  objectKey: true,
  contentSha256: true,
  contentSize: true,
  publishedAt: true,
} as const satisfies ScriptVersionSelect;

/** Script columns a view needs, with the current version joined in. */
export const SCRIPT_VIEW_SELECTION = {
  id: true,
  name: true,
  description: true,
  databaseServiceId: true,
  artifactBucket: true,
  createdAt: true,
  updatedAt: true,
  currentVersion: { select: VERSION_VIEW_SELECTION },
} as const satisfies ScriptSelect;

/**
 * A version queried on its own still needs its bucket, which lives on the owning
 * script, so the parent is joined for that single column.
 */
export const VERSION_WITH_BUCKET_SELECTION = {
  ...VERSION_VIEW_SELECTION,
  script: { select: { artifactBucket: true } },
} as const satisfies ScriptVersionSelect;

/** Adds the immutable object version id, which callers need to fetch the artifact. */
export const PUBLISHED_VERSION_SELECTION = {
  ...VERSION_WITH_BUCKET_SELECTION,
  objectVersionId: true,
} as const satisfies ScriptVersionSelect;

/** Row shapes the selections above produce, all derived from the schema. */
export type ScriptViewRecord = ScriptGetPayload<{ select: typeof SCRIPT_VIEW_SELECTION }>;
export type VersionViewRecord = ScriptVersionGetPayload<{ select: typeof VERSION_VIEW_SELECTION }>;
export type VersionWithBucketRecord = ScriptVersionGetPayload<{
  select: typeof VERSION_WITH_BUCKET_SELECTION;
}>;
export type PublishedVersionRecord = ScriptVersionGetPayload<{
  select: typeof PUBLISHED_VERSION_SELECTION;
}>;

/**
 * Projects script and script-version rows onto the read models.
 *
 * The reader only ever queries active scripts, so `status` is fixed rather than
 * read from the row; the filter and the projected value are kept in step by both
 * referring to the generated {@link ScriptStatus} enum.
 *
 * A version's bucket is never stored on the version row, so every method that
 * maps a version takes it explicitly.
 */
@Injectable()
export class ScriptViewMapper {
  /** The lifecycle value the read side filters on and reports. */
  public static readonly ACTIVE = ScriptStatus.ACTIVE;

  /** Projects a script row, and its current version if any, onto the read model. */
  public toScriptView(record: ScriptViewRecord): ScriptView {
    return {
      id: record.id,
      name: record.name,
      description: record.description ?? undefined,
      connectionId: record.databaseServiceId,
      status: ScriptViewMapper.ACTIVE,
      currentVersion:
        record.currentVersion === null
          ? undefined
          : this.toVersionView(record.currentVersion, record.artifactBucket),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** Projects a version row onto the read model. */
  public toVersionView(record: VersionViewRecord, artifactBucket: string): ScriptVersionView {
    return {
      id: record.id,
      scriptId: record.scriptId,
      versionNumber: record.versionNumber,
      artifactBucket,
      objectKey: record.objectKey,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      publishedAt: record.publishedAt.toISOString(),
    };
  }

  /** Projects a version joined to its script, taking the bucket from that join. */
  public toJoinedVersionView(record: VersionWithBucketRecord): ScriptVersionView {
    return this.toVersionView(record, record.script.artifactBucket);
  }

  /** Projects a published version, including the object version id. */
  public toPublishedRecord(record: PublishedVersionRecord): PublishedScriptRecord {
    return {
      ...this.toJoinedVersionView(record),
      objectVersionId: record.objectVersionId,
    };
  }
}
