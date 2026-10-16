import type {
  ArtifactLocation,
  ArtifactVersionId,
  SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';

export interface ArtifactWriteIdentity {
  readonly versionId: ArtifactVersionId;
  readonly etag: string;
  readonly created: boolean;
}

export interface ArtifactStat {
  readonly versionId: ArtifactVersionId;
  readonly etag: string;
  readonly contentSize: number;
}

export interface ISourceArtifactStore {
  putVerified(
    location: ArtifactLocation,
    content: Uint8Array,
    sourceHash: SourceHash,
  ): Promise<ArtifactWriteIdentity>;
  statExact(location: ArtifactLocation, versionId: ArtifactVersionId): Promise<ArtifactStat>;
  readVerified(
    location: ArtifactLocation,
    versionId: ArtifactVersionId,
    sourceHash: SourceHash,
    contentSize: number,
  ): Promise<Uint8Array>;
  removeExact(location: ArtifactLocation, versionId: ArtifactVersionId): Promise<void>;
}
