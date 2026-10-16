import { UniqueId } from '@domain/shared/unique-id';
import { ScriptError } from '@domain/script-authoring/errors/script.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { ScriptMessage } from '@domain/script-authoring/errors/script.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?$/u;

const text = TextGuard.reporting((message) => ScriptError.validation(message));

function bucketName(label: string, value: string): string {
  const normalized = text.required(label, value, 63).toLowerCase();
  if (!BUCKET_NAME_PATTERN.test(normalized) || normalized.includes('..')) {
    throw ScriptError.validation(SharedValidationMessage.mustBeValidBucketName(label));
  }
  return normalized;
}

export class ScriptId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): ScriptId {
    try {
      return new ScriptId(value);
    } catch {
      throw ScriptError.validation(ScriptMessage.invalidScriptId);
    }
  }
}

export class ScriptVersionId extends UniqueId {
  private constructor(value: string) {
    super(value);
  }

  public static from(value: string): ScriptVersionId {
    try {
      return new ScriptVersionId(value);
    } catch {
      throw ScriptError.validation(ScriptMessage.invalidScriptVersionId);
    }
  }
}

export class ScriptName {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): ScriptName {
    return new ScriptName(text.required('Script name', value, 160));
  }

  public equals(other: ScriptName): boolean {
    return this.value === other.value;
  }
}

export class ScriptDescription {
  private constructor(public readonly value: string | undefined) {
    Object.freeze(this);
  }

  public static create(value?: string | null): ScriptDescription {
    if (value === undefined || value === null) {
      return new ScriptDescription(undefined);
    }
    const normalized = value.trim();
    if (normalized.includes('\0')) {
      throw ScriptError.validation(ScriptMessage.descriptionInvalidCharacter);
    }
    return new ScriptDescription(normalized === '' ? undefined : normalized);
  }

  public equals(other: ScriptDescription): boolean {
    return this.value === other.value;
  }
}

export class ArtifactLocation {
  private constructor(
    public readonly bucket: string,
    public readonly objectKey: string,
  ) {
    Object.freeze(this);
  }

  public static create(
    bucket: string,
    objectKey: string,
    icebergWarehouseBucket = 'warehouse',
  ): ArtifactLocation {
    const normalizedBucket = bucketName('Artifact bucket', bucket);
    const normalizedWarehouseBucket = bucketName(
      'Iceberg warehouse bucket',
      icebergWarehouseBucket,
    );
    if (normalizedBucket === normalizedWarehouseBucket) {
      throw ScriptError.validation(ScriptMessage.artifactOutsideWarehouse);
    }

    const normalizedObjectKey = text.required('Artifact object key', objectKey, 1000);
    if (
      normalizedObjectKey.startsWith('/') ||
      normalizedObjectKey.endsWith('/') ||
      normalizedObjectKey.includes('//')
    ) {
      throw ScriptError.validation(ScriptMessage.artifactKeyNotRelative);
    }
    return new ArtifactLocation(normalizedBucket, normalizedObjectKey);
  }

  public static prefixFor(scriptId: ScriptId): string {
    return `scripts/${scriptId.value}`;
  }

  public static forVersion(
    bucket: string,
    scriptId: ScriptId,
    versionNumber: VersionNumber,
  ): ArtifactLocation {
    return ArtifactLocation.create(
      bucket,
      `${ArtifactLocation.prefixFor(scriptId)}/versions/${versionNumber.value}/main.py`,
    );
  }

  public equals(other: ArtifactLocation): boolean {
    return this.bucket === other.bucket && this.objectKey === other.objectKey;
  }
}

export class ArtifactVersionId {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static create(value: string): ArtifactVersionId {
    return new ArtifactVersionId(text.required('Artifact object version ID', value, 1024));
  }

  public equals(other: ArtifactVersionId): boolean {
    return this.value === other.value;
  }
}

export class SourceHash {
  private constructor(public readonly value: string) {
    Object.freeze(this);
  }

  public static fromSha256(value: string): SourceHash {
    const normalized = value.trim().toLowerCase();
    if (!SourceHash.isSha256Digest(normalized)) {
      throw ScriptError.validation(ScriptMessage.invalidSourceHash);
    }
    return new SourceHash(normalized);
  }

  /**
   * Whether `value` is already a well-formed lowercase SHA-256 digest.
   *
   * Exposed so an integrity check can ask the question without constructing a
   * value object and catching the failure. The pattern lives here and is used by
   * both paths, so the two can never disagree about what a digest looks like.
   */
  public static isSha256Digest(value: string): boolean {
    return SHA_256_PATTERN.test(value);
  }

  public equals(other: SourceHash): boolean {
    return this.value === other.value;
  }
}

export class VersionNumber {
  private constructor(public readonly value: number) {
    Object.freeze(this);
  }

  public static create(value: number): VersionNumber {
    if (!Number.isInteger(value) || value < 1 || value > MAX_DATABASE_INTEGER) {
      throw ScriptError.validation(ScriptMessage.versionNumberOutOfRange(MAX_DATABASE_INTEGER));
    }
    return new VersionNumber(value);
  }

  public static from(value: number): VersionNumber {
    return VersionNumber.create(value);
  }

  public next(): VersionNumber {
    return VersionNumber.create(this.value + 1);
  }

  public isImmediateSuccessorOf(previous?: VersionNumber): boolean {
    return this.value === (previous?.value ?? 0) + 1;
  }

  public equals(other: VersionNumber): boolean {
    return this.value === other.value;
  }
}
