import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import type {
  ArtifactLocation,
  ArtifactVersionId,
  ScriptId,
  ScriptVersionId,
  SourceHash,
  VersionNumber,
} from '@domain/script-authoring/value-objects/script-value-objects';
import { ArtifactLocation as ArtifactLocationValue } from '@domain/script-authoring/value-objects/script-value-objects';
import { ScriptMessage } from '@domain/script-authoring/errors/script.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

const MAX_DATABASE_INTEGER = 2_147_483_647;

export interface ScriptVersionState {
  readonly id: ScriptVersionId;
  readonly scriptId: ScriptId;
  readonly versionNumber: VersionNumber;
  readonly artifactLocation: ArtifactLocation;
  readonly artifactVersionId: ArtifactVersionId;
  readonly sourceHash: SourceHash;
  readonly contentSize: number;
  readonly publishedAt: Date;
}

function immutableDate(label: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw ScriptError.validation(SharedValidationMessage.mustBeValidDate(label));
  }
  return new Date(value.getTime());
}

export class ScriptVersion {
  private readonly idValue: ScriptVersionId;
  private readonly scriptIdValue: ScriptId;
  private readonly versionNumberValue: VersionNumber;
  private readonly artifactLocationValue: ArtifactLocation;
  private readonly artifactVersionIdValue: ArtifactVersionId;
  private readonly sourceHashValue: SourceHash;
  private readonly contentSizeValue: number;
  private readonly publishedAtValue: Date;

  private constructor(state: ScriptVersionState) {
    if (
      !Number.isSafeInteger(state.contentSize) ||
      state.contentSize < 1 ||
      state.contentSize > MAX_DATABASE_INTEGER
    ) {
      throw ScriptError.validation(ScriptMessage.sourceSizeOutOfRange(MAX_DATABASE_INTEGER));
    }

    const expectedLocation = ArtifactLocationValue.forVersion(
      state.artifactLocation.bucket,
      state.scriptId,
      state.versionNumber,
    );
    if (!state.artifactLocation.equals(expectedLocation)) {
      throw ScriptError.validation(ScriptMessage.versionArtifactKeyNotDeterministic);
    }

    this.idValue = state.id;
    this.scriptIdValue = state.scriptId;
    this.versionNumberValue = state.versionNumber;
    this.artifactLocationValue = state.artifactLocation;
    this.artifactVersionIdValue = state.artifactVersionId;
    this.sourceHashValue = state.sourceHash;
    this.contentSizeValue = state.contentSize;
    this.publishedAtValue = immutableDate('Publication time', state.publishedAt);
    Object.freeze(this);
  }

  public static publish(state: ScriptVersionState): ScriptVersion {
    return new ScriptVersion(state);
  }

  public static create(state: ScriptVersionState): ScriptVersion {
    return new ScriptVersion(state);
  }

  public static rehydrate(state: ScriptVersionState): ScriptVersion {
    return new ScriptVersion(state);
  }

  public get id(): ScriptVersionId {
    return this.idValue;
  }

  public get scriptId(): ScriptId {
    return this.scriptIdValue;
  }

  public get versionNumber(): VersionNumber {
    return this.versionNumberValue;
  }

  public get artifactLocation(): ArtifactLocation {
    return this.artifactLocationValue;
  }

  public get artifactVersionId(): ArtifactVersionId {
    return this.artifactVersionIdValue;
  }

  public get sourceHash(): SourceHash {
    return this.sourceHashValue;
  }

  public get contentSize(): number {
    return this.contentSizeValue;
  }

  public get publishedAt(): Date {
    return new Date(this.publishedAtValue.getTime());
  }

  public get objectKey(): string {
    return this.artifactLocationValue.objectKey;
  }

  public get objectVersionId(): string {
    return this.artifactVersionIdValue.value;
  }

  public get sourceSize(): number {
    return this.contentSizeValue;
  }
}
