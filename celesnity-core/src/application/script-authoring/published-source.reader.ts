import { ArtifactError } from '@application/script-authoring/errors/artifact.error';
import type { PublishedScriptRecord } from '@application/script-authoring/interfaces/i-script-reader';
import type { ISourceArtifactStore } from '@application/script-authoring/interfaces/i-source-artifact-store';
import type { ScriptAuthoringConfig } from '@application/script-authoring/script-authoring.config';
import type {
  ScriptId,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import {
  ArtifactLocation,
  ArtifactVersionId,
  SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';

/** A published source that passed every integrity check. */
export interface VerifiedPublishedSource {
  readonly location: ArtifactLocation;
  readonly objectVersionId: ArtifactVersionId;
  readonly source: Uint8Array;
}

/**
 * Reads a published script source, refusing anything that does not match its
 * metadata exactly.
 *
 * Extracted from `ScriptAuthoringUseCases`, where it was two private methods
 * among nine. It is its own concern for a reason worth stating: this is the
 * integrity boundary between the database and object storage, and the two can
 * disagree. A row can point at an object key that was rewritten, a digest that no
 * longer matches, or a size outside the accepted range. Every one of those is
 * treated as corruption rather than something to tolerate, because the bytes this
 * returns are then executed as a Spark job.
 *
 * The checks are deliberately redundant with the write path. The write path
 * establishes these invariants; this re-establishes them at the point of use, so
 * a row mutated by anything other than this application still cannot produce
 * executable source.
 */
export class PublishedSourceReader {
  public constructor(
    private readonly artifactStore: ISourceArtifactStore,
    private readonly config: ScriptAuthoringConfig,
  ) {}

  /**
   * Verifies `record` against the location it must occupy, then reads and
   * digest-checks the object it names.
   */
  public async read(
    record: PublishedScriptRecord,
    scriptId: ScriptId,
    versionNumber: VersionNumber,
  ): Promise<VerifiedPublishedSource> {
    const expectedLocation = ArtifactLocation.forVersion(
      record.artifactBucket,
      scriptId,
      versionNumber,
    );
    if (!this.describesExpectedObject(record, scriptId, versionNumber, expectedLocation)) {
      throw ArtifactError.integrity();
    }

    const objectVersionId = this.parseObjectVersionId(record.objectVersionId);
    const source = await this.artifactStore.readVerified(
      expectedLocation,
      objectVersionId,
      SourceHash.fromSha256(record.contentSha256),
      record.contentSize,
    );
    return { location: expectedLocation, objectVersionId, source };
  }

  /**
   * Whether the row still describes the object it is supposed to. The object key
   * is recomputed rather than trusted, so a rewritten key cannot redirect a read
   * to another script's source.
   */
  private describesExpectedObject(
    record: PublishedScriptRecord,
    scriptId: ScriptId,
    versionNumber: VersionNumber,
    expectedLocation: ArtifactLocation,
  ): boolean {
    return (
      record.scriptId === scriptId.value &&
      record.versionNumber === versionNumber.value &&
      record.artifactBucket === this.config.artifactsBucket &&
      record.objectKey === expectedLocation.objectKey &&
      SourceHash.isSha256Digest(record.contentSha256) &&
      record.contentSize >= 1 &&
      record.contentSize <= this.config.sourceMaxBytes
    );
  }

  private parseObjectVersionId(value: string): ArtifactVersionId {
    try {
      return ArtifactVersionId.create(value);
    } catch {
      // A malformed stored version id is corruption, not a validation error the
      // caller could fix, so it is reported as such rather than propagated raw.
      throw ArtifactError.integrity();
    }
  }
}
