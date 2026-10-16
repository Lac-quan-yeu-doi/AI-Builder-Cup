import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  FirmwareDeployment,
  FirmwareRelease,
} from '@domain/device-management/models/firmware';

export class FirmwareReleaseResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly version!: string;
  @ApiProperty() public readonly deviceModel!: string;
  @ApiPropertyOptional() public readonly hardwareRevision?: string;
  @ApiPropertyOptional() public readonly artifactUrl?: string;
  @ApiPropertyOptional({ enum: ['MINIO', 'GCS'] })
  public readonly artifactStorageProvider?: 'MINIO' | 'GCS';
  @ApiPropertyOptional() public readonly artifactFileName?: string;
  @ApiPropertyOptional() public readonly artifactContentType?: string;
  @ApiPropertyOptional() public readonly artifactSizeBytes?: number;
  @ApiProperty() public readonly sha256!: string;
  @ApiProperty() public readonly signature!: string;
  @ApiPropertyOptional() public readonly signingKeyId?: string;
  @ApiPropertyOptional() public readonly signatureVerifiedAt?: string;
  @ApiPropertyOptional() public readonly releaseNotes?: string;
  @ApiProperty() public readonly createdBy!: string;
  @ApiProperty() public readonly createdAt!: string;

  public static from(release: FirmwareRelease): FirmwareReleaseResponseDto {
    return {
      id: release.id,
      version: release.version,
      deviceModel: release.deviceModel,
      ...(release.hardwareRevision === undefined
        ? {}
        : { hardwareRevision: release.hardwareRevision }),
      ...(release.artifactUrl === undefined ? {} : { artifactUrl: release.artifactUrl }),
      ...(release.artifactStorageProvider === undefined
        ? {}
        : { artifactStorageProvider: release.artifactStorageProvider }),
      ...(release.artifactFileName === undefined
        ? {}
        : { artifactFileName: release.artifactFileName }),
      ...(release.artifactContentType === undefined
        ? {}
        : { artifactContentType: release.artifactContentType }),
      ...(release.artifactSizeBytes === undefined
        ? {}
        : { artifactSizeBytes: release.artifactSizeBytes }),
      sha256: release.sha256,
      signature: release.signature,
      ...(release.signingKeyId === undefined ? {} : { signingKeyId: release.signingKeyId }),
      ...(release.signatureVerifiedAt === undefined
        ? {}
        : { signatureVerifiedAt: release.signatureVerifiedAt }),
      ...(release.releaseNotes === undefined ? {} : { releaseNotes: release.releaseNotes }),
      createdBy: release.createdBy,
      createdAt: release.createdAt,
    };
  }
}

export class FirmwareDeploymentResponseDto {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly deviceId!: string;
  @ApiProperty() public readonly releaseId!: string;
  @ApiProperty() public readonly releaseVersion!: string;
  @ApiProperty() public readonly status!: string;
  @ApiProperty() public readonly progressPercent!: number;
  @ApiPropertyOptional() public readonly previousVersion?: string;
  @ApiPropertyOptional() public readonly error?: string;
  @ApiProperty() public readonly requestedBy!: string;
  @ApiProperty() public readonly requestedAt!: string;
  @ApiPropertyOptional() public readonly startedAt?: string;
  @ApiPropertyOptional() public readonly finishedAt?: string;
  @ApiProperty() public readonly updatedAt!: string;

  public static from(deployment: FirmwareDeployment): FirmwareDeploymentResponseDto {
    return {
      id: deployment.id,
      deviceId: deployment.deviceId,
      releaseId: deployment.releaseId,
      releaseVersion: deployment.releaseVersion,
      status: deployment.status,
      progressPercent: deployment.progressPercent,
      ...(deployment.previousVersion === undefined
        ? {}
        : { previousVersion: deployment.previousVersion }),
      ...(deployment.error === undefined ? {} : { error: deployment.error }),
      requestedBy: deployment.requestedBy,
      requestedAt: deployment.requestedAt,
      ...(deployment.startedAt === undefined ? {} : { startedAt: deployment.startedAt }),
      ...(deployment.finishedAt === undefined ? {} : { finishedAt: deployment.finishedAt }),
      updatedAt: deployment.updatedAt,
    };
  }
}
