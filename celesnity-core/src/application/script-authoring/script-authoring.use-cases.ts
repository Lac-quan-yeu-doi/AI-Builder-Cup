import type { IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import { Script } from '@domain/script-authoring/aggregates/script';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import type { IScriptRepository } from '@application/script-authoring/interfaces/i-script-repository';
import {
  ArtifactLocation,
  ScriptDescription,
  ScriptId,
  ScriptName,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { PublishedScript } from '@application/script-authoring/interfaces/i-published-script-provider';
import type { IScriptMetadataRepository } from '@application/script-authoring/interfaces/i-script-metadata-repository';
import type {
  PublishedScriptRecord,
  IScriptReader,
  ScriptVersionView,
  ScriptView,
} from '@application/script-authoring/interfaces/i-script-reader';
import { toScriptOutboxMessage } from '@application/script-authoring/script-outbox.mapper';
import { toScriptView } from '@application/script-authoring/read-models/script.projection';
import type { PublishedSourceReader } from '@application/script-authoring/published-source.reader';
import type { ScriptPublicationService } from '@application/script-authoring/script-publication.service';
import type { ScriptAuthoringConfig } from '@application/script-authoring/script-authoring.config';

export interface CreateScriptCommand {
  readonly name: string;
  readonly description?: string;
  readonly connectionId: string;
}

export interface UpdateScriptCommand {
  readonly id: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly connectionId?: string;
}

export interface PublishScriptVersionCommand {
  readonly scriptId: string;
  readonly source: string;
}

export interface ScriptSourceView extends ScriptVersionView {
  readonly source: string;
}

/**
 * The Script Authoring surface: metadata commands, catalogue reads, and the
 * entry points for publishing and resolving a published version.
 *
 * Publication itself is delegated to {@link ScriptPublicationService} and source
 * integrity to {@link PublishedSourceReader}. Both used to live here, which made
 * this class responsible for the context's surface *and* its two hardest
 * mechanisms at once — thirteen constructor parameters, and a reader of the class
 * had to hold artifact-store semantics in mind to follow a rename.
 */
export class ScriptAuthoringUseCases {
  public constructor(
    private readonly repository: IScriptRepository,
    private readonly metadataRepository: IScriptMetadataRepository,
    private readonly reader: IScriptReader,
    private readonly connectionReferences: IConnectionReferenceProvider,
    private readonly publication: ScriptPublicationService,
    private readonly publishedSource: PublishedSourceReader,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly config: ScriptAuthoringConfig,
  ) {}

  public list(): Promise<readonly ScriptView[]> {
    return this.reader.listActive();
  }

  public async get(idValue: string): Promise<ScriptView> {
    const id = ScriptId.from(idValue);
    return this.requireView(id.value);
  }

  public async create(command: CreateScriptCommand): Promise<ScriptView> {
    const connection = await this.connectionReferences.requireActive(command.connectionId);
    const id = ScriptId.from(this.idGenerator.next());
    const now = this.clock.now();
    const script = Script.create(
      {
        id,
        name: ScriptName.create(command.name),
        description: ScriptDescription.create(command.description),
        connectionId: connection.id,
        artifactBucket: this.config.artifactsBucket,
        artifactPrefix: ArtifactLocation.prefixFor(id),
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
      this.idGenerator.next(),
    );

    await this.unitOfWork.commit(async (events) => {
      await this.metadataRepository.create(script);
      events.record(...script.pullDomainEvents().map(toScriptOutboxMessage));
    });
    return toScriptView(script);
  }

  public async update(command: UpdateScriptCommand): Promise<ScriptView> {
    const script = await this.requireAggregate(command.id);
    const expectedRevision = script.revision;
    const connectionId = command.connectionId ?? script.connectionId;
    if (command.connectionId !== undefined) {
      await this.connectionReferences.requireActive(connectionId);
    }

    const changed = script.changeMetadata({
      name: command.name === undefined ? script.name : ScriptName.create(command.name),
      description:
        command.description === undefined
          ? script.description
          : ScriptDescription.create(command.description),
      connectionId,
      changedAt: this.clock.now(),
      eventId: this.idGenerator.next(),
    });
    if (!changed) {
      return toScriptView(script);
    }

    await this.unitOfWork.commit(async (events) => {
      await this.metadataRepository.update(script, expectedRevision);
      events.record(...script.pullDomainEvents().map(toScriptOutboxMessage));
    });
    return toScriptView(script);
  }

  public publishVersion(command: PublishScriptVersionCommand): Promise<ScriptVersionView> {
    return this.publication.publish(ScriptId.from(command.scriptId), command.source);
  }

  public async listVersions(scriptIdValue: string): Promise<readonly ScriptVersionView[]> {
    const scriptId = ScriptId.from(scriptIdValue);
    await this.requireView(scriptId.value);
    return this.reader.listPublishedVersions(scriptId.value);
  }

  public async getVersionSource(
    scriptIdValue: string,
    versionNumberValue: number,
  ): Promise<ScriptSourceView> {
    const scriptId = ScriptId.from(scriptIdValue);
    const versionNumber = VersionNumber.create(versionNumberValue);
    const record = await this.requirePublishedRecord(scriptId.value, versionNumber.value);
    const verified = await this.publishedSource.read(record, scriptId, versionNumber);
    return {
      id: record.id,
      scriptId: record.scriptId,
      versionNumber: record.versionNumber,
      artifactBucket: record.artifactBucket,
      objectKey: record.objectKey,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      publishedAt: record.publishedAt,
      source: Buffer.from(verified.source).toString('utf8'),
    };
  }

  /**
   * Resolves a published version into everything an execution needs, including
   * the verified source bytes. This is the port the Execution Orchestration
   * context consumes.
   */
  public async resolvePublishedVersion(
    scriptIdValue: string,
    versionNumberValue: number,
  ): Promise<PublishedScript> {
    const scriptId = ScriptId.from(scriptIdValue);
    const versionNumber = VersionNumber.create(versionNumberValue);
    const script = await this.requireView(scriptId.value);
    if (script.currentVersion === undefined) {
      throw ScriptError.draft();
    }

    const record = await this.requirePublishedRecord(scriptId.value, versionNumber.value);
    const verified = await this.publishedSource.read(record, scriptId, versionNumber);
    return {
      scriptId: record.scriptId,
      scriptVersionId: record.id,
      versionNumber: record.versionNumber,
      connectionId: script.connectionId,
      artifactBucket: verified.location.bucket,
      objectKey: verified.location.objectKey,
      objectVersionId: verified.objectVersionId.value,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      source: verified.source,
    };
  }

  private async requireAggregate(idValue: string): Promise<Script> {
    const id = ScriptId.from(idValue);
    const script = await this.repository.findById(id);
    if (script === undefined) {
      throw ScriptError.notFound();
    }
    if (script.isArchived) {
      throw ScriptError.archived();
    }
    return script;
  }

  private async requireView(id: string): Promise<ScriptView> {
    const script = await this.reader.findActiveById(id);
    if (script === undefined) {
      throw ScriptError.notFound();
    }
    return script;
  }

  private async requirePublishedRecord(
    scriptId: string,
    versionNumber: number,
  ): Promise<PublishedScriptRecord> {
    const record = await this.reader.findPublishedVersion(scriptId, versionNumber);
    if (record === undefined) {
      throw ScriptError.versionNotFound();
    }
    return record;
  }
}
