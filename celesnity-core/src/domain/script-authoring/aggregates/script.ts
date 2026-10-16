import type { DomainEvent } from '@domain/shared/domain-event';
import type { ScriptVersion } from '@domain/script-authoring/entities/script-version';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import {
  ScriptEvent,
  ScriptEventName,
  ScriptVersionPublishedEvent,
} from '@domain/script-authoring/events/script.events';
import type {
  ScriptDescription,
  ScriptId,
  ScriptName,
  ScriptVersionId,
} from '@domain/script-authoring/value-objects/script-value-objects';
import {
  ArtifactLocation,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import { ScriptMessage } from '@domain/script-authoring/errors/script.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DATABASE_INTEGER = 2_147_483_647;

export interface ScriptState {
  readonly id: ScriptId;
  readonly name: ScriptName;
  readonly description: ScriptDescription;
  readonly connectionId: string;
  readonly artifactBucket: string;
  readonly artifactPrefix: string;
  readonly revision: number;
  readonly currentVersion?: ScriptVersion;
  readonly archivedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ChangeScriptMetadata {
  readonly name: ScriptName;
  readonly description: ScriptDescription;
  readonly connectionId: string;
  readonly changedAt: Date;
  readonly eventId: string;
}

function uuid(label: string, value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw ScriptError.validation(SharedValidationMessage.mustBeValidUuid(label));
  }
  return normalized.toLowerCase();
}

function dateValue(label: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw ScriptError.validation(SharedValidationMessage.mustBeValidDate(label));
  }
  return new Date(value.getTime());
}

function revisionValue(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_DATABASE_INTEGER) {
    throw ScriptError.validation(ScriptMessage.revisionOutOfRange(MAX_DATABASE_INTEGER));
  }
  return value;
}

export class Script {
  private readonly domainEvents: DomainEvent[] = [];
  private readonly idValue: ScriptId;
  private nameValue: ScriptName;
  private descriptionValue: ScriptDescription;
  private connectionIdValue: string;
  private readonly artifactBucketValue: string;
  private readonly artifactPrefixValue: string;
  private revisionValue: number;
  private currentVersionValue: ScriptVersion | undefined;
  private archivedAtValue: Date | undefined;
  private updatedAtValue: Date;
  private readonly createdAtValue: Date;

  private constructor(state: ScriptState) {
    const expectedPrefix = ArtifactLocation.prefixFor(state.id);
    if (state.artifactPrefix.trim() !== expectedPrefix) {
      throw ScriptError.validation(ScriptMessage.artifactPrefixMissingScriptId);
    }
    const storageLocation = ArtifactLocation.create(
      state.artifactBucket,
      `${expectedPrefix}/metadata`,
    );

    this.idValue = state.id;
    this.nameValue = state.name;
    this.descriptionValue = state.description;
    this.connectionIdValue = uuid('Selected connection ID', state.connectionId);
    this.artifactBucketValue = storageLocation.bucket;
    this.artifactPrefixValue = expectedPrefix;
    this.revisionValue = revisionValue(state.revision);
    this.currentVersionValue = state.currentVersion;
    this.archivedAtValue =
      state.archivedAt === undefined ? undefined : dateValue('Archive time', state.archivedAt);
    this.createdAtValue = dateValue('Creation time', state.createdAt);
    this.updatedAtValue = dateValue('Update time', state.updatedAt);

    if (this.updatedAtValue.getTime() < this.createdAtValue.getTime()) {
      throw ScriptError.validation(ScriptMessage.updateBeforeCreation);
    }
    if (
      this.archivedAtValue !== undefined &&
      this.archivedAtValue.getTime() < this.createdAtValue.getTime()
    ) {
      throw ScriptError.validation(ScriptMessage.archiveBeforeCreation);
    }
    if (this.currentVersionValue !== undefined) {
      this.ensureVersionBelongsToScript(this.currentVersionValue);
      if (this.currentVersionValue.versionNumber.value > this.revisionValue) {
        throw ScriptError.validation(ScriptMessage.revisionBeforeCurrentVersion);
      }
      if (this.currentVersionValue.publishedAt.getTime() > this.updatedAtValue.getTime()) {
        throw ScriptError.validation(ScriptMessage.currentVersionAfterUpdate);
      }
    }
  }

  public static create(state: ScriptState, eventId: string): Script {
    if (state.archivedAt !== undefined) {
      throw ScriptError.archived();
    }
    if (state.currentVersion !== undefined) {
      throw ScriptError.validation(ScriptMessage.newScriptAlreadyPublished);
    }
    if (state.revision !== 0) {
      throw ScriptError.validation(ScriptMessage.newScriptRevisionNotZero);
    }
    const script = new Script(state);
    script.domainEvents.push(
      new ScriptEvent(
        uuid('Domain event ID', eventId),
        ScriptEventName.Created,
        script.id.value,
        script.createdAt,
      ),
    );
    return script;
  }

  public static rehydrate(state: ScriptState): Script {
    return new Script(state);
  }

  public get id(): ScriptId {
    return this.idValue;
  }

  public get name(): ScriptName {
    return this.nameValue;
  }

  public get description(): ScriptDescription {
    return this.descriptionValue;
  }

  public get connectionId(): string {
    return this.connectionIdValue;
  }

  public get artifactBucket(): string {
    return this.artifactBucketValue;
  }

  public get artifactPrefix(): string {
    return this.artifactPrefixValue;
  }

  public get revision(): number {
    return this.revisionValue;
  }

  public get currentVersion(): ScriptVersion | undefined {
    return this.currentVersionValue;
  }

  public get currentVersionId(): ScriptVersionId | undefined {
    return this.currentVersionValue?.id;
  }

  public get archivedAt(): Date | undefined {
    return this.archivedAtValue === undefined
      ? undefined
      : new Date(this.archivedAtValue.getTime());
  }

  public get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  public get isArchived(): boolean {
    return this.archivedAtValue !== undefined;
  }

  public changeMetadata(change: ChangeScriptMetadata): boolean {
    this.ensureActive();
    const selectedConnectionId = uuid('Selected connection ID', change.connectionId);
    const changedAt = dateValue('Metadata change time', change.changedAt);
    const hasChanged =
      !this.nameValue.equals(change.name) ||
      !this.descriptionValue.equals(change.description) ||
      this.connectionIdValue !== selectedConnectionId;

    if (!hasChanged) {
      return false;
    }

    this.ensureTransitionCanBeRecorded(changedAt);
    const eventId = uuid('Domain event ID', change.eventId);
    this.nameValue = change.name;
    this.descriptionValue = change.description;
    this.connectionIdValue = selectedConnectionId;
    this.updatedAtValue = changedAt;
    this.revisionValue += 1;
    this.domainEvents.push(
      new ScriptEvent(eventId, ScriptEventName.MetadataChanged, this.id.value, changedAt),
    );
    return true;
  }

  public nextVersionNumber(): VersionNumber {
    return this.currentVersionValue?.versionNumber.next() ?? VersionNumber.create(1);
  }

  public publishVersion(version: ScriptVersion, eventIdValue: string): void {
    this.ensureActive();
    this.ensureVersionBelongsToScript(version);
    if (!version.versionNumber.isImmediateSuccessorOf(this.currentVersionValue?.versionNumber)) {
      throw ScriptError.validation(ScriptMessage.versionMustIncreaseByOne);
    }
    this.ensureTransitionCanBeRecorded(version.publishedAt);
    const eventId = uuid('Domain event ID', eventIdValue);

    this.currentVersionValue = version;
    this.updatedAtValue = version.publishedAt;
    this.revisionValue += 1;
    this.domainEvents.push(
      new ScriptVersionPublishedEvent(
        eventId,
        this.id.value,
        version.publishedAt,
        version.id.value,
        version.versionNumber.value,
      ),
    );
  }

  public archive(archivedAt: Date, eventIdValue: string): void {
    this.ensureActive();
    const timestamp = dateValue('Archive time', archivedAt);
    this.ensureTransitionCanBeRecorded(timestamp);
    const eventId = uuid('Domain event ID', eventIdValue);

    this.archivedAtValue = timestamp;
    this.updatedAtValue = timestamp;
    this.revisionValue += 1;
    this.domainEvents.push(
      new ScriptEvent(eventId, ScriptEventName.Archived, this.id.value, timestamp),
    );
  }

  public pullDomainEvents(): readonly DomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private ensureVersionBelongsToScript(version: ScriptVersion): void {
    if (!version.scriptId.equals(this.idValue)) {
      throw ScriptError.validation(ScriptMessage.versionBelongsToAnotherScript);
    }
    const expectedLocation = ArtifactLocation.forVersion(
      this.artifactBucketValue,
      this.idValue,
      version.versionNumber,
    );
    if (!version.artifactLocation.equals(expectedLocation)) {
      throw ScriptError.validation(ScriptMessage.versionArtifactLocationUnexpected);
    }
  }

  private ensureTransitionCanBeRecorded(at: Date): void {
    if (at.getTime() < this.updatedAtValue.getTime()) {
      throw ScriptError.validation(ScriptMessage.transitionBeforeLastUpdate);
    }
    if (this.revisionValue === MAX_DATABASE_INTEGER) {
      throw ScriptError.validation(ScriptMessage.revisionExhausted);
    }
  }

  private ensureActive(): void {
    if (this.isArchived) {
      throw ScriptError.archived();
    }
  }
}
