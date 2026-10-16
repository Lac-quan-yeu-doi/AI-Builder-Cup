import { createHash } from 'node:crypto';

import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import { ScriptMessage } from '@domain/script-authoring/errors/script.messages';
import type { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import type { ScriptId } from '@domain/script-authoring/value-objects/script-value-objects';
import {
  ArtifactLocation,
  ScriptVersionId,
  SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';
import type { PerScriptPublicationQueue } from '@application/script-authoring/per-script-publication.queue';
import type { IScriptPublicationLock } from '@application/script-authoring/interfaces/i-script-publication-lock';
import type { IScriptRepository } from '@application/script-authoring/interfaces/i-script-repository';
import type { ScriptVersionView } from '@application/script-authoring/interfaces/i-script-reader';
import type {
  PersistedScriptVersion,
  IScriptVersionRepository,
} from '@application/script-authoring/interfaces/i-script-version-repository';
import type { ISourceArtifactStore } from '@application/script-authoring/interfaces/i-source-artifact-store';
import { toScriptOutboxMessage } from '@application/script-authoring/script-outbox.mapper';
import { toScriptVersionView } from '@application/script-authoring/read-models/script.projection';
import type { ScriptAuthoringConfig } from '@application/script-authoring/script-authoring.config';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

/**
 * Publishes new immutable versions of a script's source.
 *
 * Split out of `ScriptAuthoringUseCases` because publication is the only
 * genuinely difficult operation in the context and it dominated the class:
 * metadata editing is a load-mutate-save, whereas publication has to write to
 * object storage and to the database without a transaction spanning both, under
 * three layers of mutual exclusion, and reconcile the outcome when the second
 * write fails after the first succeeded. Keeping it here leaves the use-case class
 * to describe the context's surface rather than its hardest mechanism.
 *
 * Three serialization layers, each covering what the next cannot:
 *
 *  - {@link PerScriptPublicationQueue} orders concurrent publishes of the same
 *    script within one process, so requests queue instead of colliding.
 *  - {@link IScriptPublicationLock} is a database advisory lock, which extends
 *    that ordering across processes.
 *  - the guarded update in {@link IScriptVersionRepository.publish} is the
 *    authoritative check, and holds even if both locks were somehow bypassed.
 *
 * The write order is deliberate: the artifact goes to object storage first, then
 * the row. An orphaned artifact with no row is inert — nothing can reference it.
 * A row pointing at an artifact that was never written would be a version that
 * cannot be executed.
 */
export class ScriptPublicationService {
  public constructor(
    private readonly repository: IScriptRepository,
    private readonly versionRepository: IScriptVersionRepository,
    private readonly artifactStore: ISourceArtifactStore,
    private readonly publicationQueue: PerScriptPublicationQueue,
    private readonly publicationLock: IScriptPublicationLock,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly config: ScriptAuthoringConfig,
  ) {}

  /** Publishes `source` as the script's next version. */
  public publish(scriptId: ScriptId, source: string): Promise<ScriptVersionView> {
    return this.publicationQueue.run(scriptId.value, () =>
      this.publicationLock.run(scriptId, () => this.publishExclusively(scriptId, source)),
    );
  }

  private async publishExclusively(scriptId: ScriptId, source: string): Promise<ScriptVersionView> {
    const script = await this.requireActive(scriptId);
    const content = this.requireAcceptableSize(Buffer.from(source, 'utf8'));

    const version = await this.stageArtifact(script, content);
    const expectedCurrentVersionId = script.currentVersion?.id;
    const expectedRevision = script.revision;
    script.publishVersion(version, this.idGenerator.next());

    await this.recordPublication(script, version, expectedCurrentVersionId, expectedRevision);
    return toScriptVersionView(version, script.artifactBucket);
  }

  /**
   * Writes the source to object storage and builds the version entity describing
   * it. The digest is computed here and handed to the store, which verifies the
   * object it wrote matches — so a corrupted upload fails before any row exists.
   */
  private async stageArtifact(script: Script, content: Buffer): Promise<ScriptVersion> {
    const versionNumber = script.nextVersionNumber();
    const sourceHash = SourceHash.fromSha256(createHash('sha256').update(content).digest('hex'));
    const location = ArtifactLocation.forVersion(script.artifactBucket, script.id, versionNumber);
    const writeIdentity = await this.artifactStore.putVerified(location, content, sourceHash);

    return ScriptVersion.publish({
      id: ScriptVersionId.from(this.idGenerator.next()),
      scriptId: script.id,
      versionNumber,
      artifactLocation: location,
      artifactVersionId: writeIdentity.versionId,
      sourceHash,
      contentSize: content.length,
      publishedAt: this.clock.now(),
    });
  }

  /**
   * Commits the version row, the script's advance to it, and the publication
   * event together.
   *
   * The recovery path handles one specific hazard: the commit can fail *after*
   * the database applied it, for example when the connection drops between commit
   * and acknowledgement. Retrying would then be wrong, because the version
   * already exists. So on failure the persisted state is inspected, and the error
   * is swallowed only when what is stored is byte-for-byte the version this call
   * intended to write.
   */
  private async recordPublication(
    script: Script,
    version: ScriptVersion,
    expectedCurrentVersionId: ScriptVersionId | undefined,
    expectedRevision: number,
  ): Promise<void> {
    try {
      await this.unitOfWork.commit(async (events) => {
        await this.versionRepository.publish({
          scriptId: script.id,
          version,
          expectedCurrentVersionId,
          expectedRevision,
          revision: script.revision,
        });
        events.record(...script.pullDomainEvents().map(toScriptOutboxMessage));
      });
    } catch (error: unknown) {
      if (!(await this.publicationAlreadyLanded(version, script.revision))) {
        throw error;
      }
    }
  }

  /**
   * Whether the stored version is exactly the one this publication attempted.
   *
   * Every field is compared, not just the id. A matching id with a different
   * digest or object key would mean two publications produced the same id, which
   * should be impossible — and if it ever happened, treating it as success would
   * silently accept the wrong source.
   */
  private async publicationAlreadyLanded(
    version: ScriptVersion,
    committedRevision: number,
  ): Promise<boolean> {
    let persisted: PersistedScriptVersion | undefined;
    try {
      persisted = await this.versionRepository.findById(version.id);
    } catch {
      // The reconciliation read failed too, so nothing can be concluded. Report
      // "not landed" and let the original error surface.
      return false;
    }
    if (persisted === undefined) {
      return false;
    }

    return (
      persisted.id === version.id.value &&
      persisted.scriptId === version.scriptId.value &&
      persisted.versionNumber === version.versionNumber.value &&
      persisted.artifactBucket === version.artifactLocation.bucket &&
      persisted.objectKey === version.artifactLocation.objectKey &&
      persisted.objectVersionId === version.artifactVersionId.value &&
      persisted.contentSha256 === version.sourceHash.value &&
      persisted.contentSize === version.contentSize &&
      persisted.publishedAt.getTime() === version.publishedAt.getTime() &&
      persisted.currentVersionId === version.id.value &&
      persisted.revision >= committedRevision
    );
  }

  private requireAcceptableSize(content: Buffer): Buffer {
    if (content.length < 1 || content.length > this.config.sourceMaxBytes) {
      throw ScriptError.validation(ScriptMessage.sourceBytesOutOfRange(this.config.sourceMaxBytes));
    }
    return content;
  }

  private async requireActive(id: ScriptId): Promise<Script> {
    const script = await this.repository.findById(id);
    if (script === undefined) {
      throw ScriptError.notFound();
    }
    if (script.isArchived) {
      throw ScriptError.archived();
    }
    return script;
  }
}
