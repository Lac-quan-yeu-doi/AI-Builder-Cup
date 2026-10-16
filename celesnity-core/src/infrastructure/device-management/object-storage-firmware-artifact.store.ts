import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type { Client } from 'minio';

import type {
  IFirmwareArtifactStore,
  StoreFirmwareArtifactInput,
} from '@application/device-management/interfaces/i-firmware-artifact-store';
import { DeviceError } from '@domain/device-management/errors/device.errors';
import type {
  FirmwareRelease,
  ManagedFirmwareArtifact,
} from '@domain/device-management/models/firmware';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';

@Injectable()
export class ObjectStorageFirmwareArtifactStore implements IFirmwareArtifactStore {
  private readonly provider: 'MINIO' | 'GCS';
  private readonly bucket: string;
  private readonly downloadUrlTtlSeconds: number;
  private readonly minio: Client;
  private readonly gcs: Storage;

  public constructor(clients: MinioClientFactory, config: ConfigService) {
    this.provider = config.getOrThrow<'MINIO' | 'GCS'>('FIRMWARE_ARTIFACT_STORAGE_PROVIDER');
    this.bucket = config.getOrThrow<string>('FIRMWARE_ARTIFACTS_BUCKET');
    this.downloadUrlTtlSeconds = config.getOrThrow<number>('FIRMWARE_DOWNLOAD_URL_TTL_SECONDS');
    this.minio = clients.create();
    this.gcs = new Storage();
  }

  public async put(input: StoreFirmwareArtifactInput): Promise<ManagedFirmwareArtifact> {
    const objectKey = `firmware/${input.organizationId}/${input.releaseId}/artifact`;
    const body = Buffer.from(input.bytes);
    if (this.provider === 'GCS') {
      await this.gcs
        .bucket(this.bucket)
        .file(objectKey)
        .save(body, {
          resumable: false,
          contentType: input.contentType,
          metadata: {
            cacheControl: 'private, no-store',
            metadata: {
              firmwareSha256: input.sha256,
              originalFileName: input.fileName,
            },
          },
        });
    } else {
      await this.minio.putObject(this.bucket, objectKey, body, body.length, {
        'Content-Type': input.contentType,
        'Cache-Control': 'private, no-store',
        'X-Amz-Meta-Firmware-Sha256': input.sha256,
        'X-Amz-Meta-Original-File-Name': input.fileName,
      });
    }
    return {
      storageProvider: this.provider,
      bucket: this.bucket,
      objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: body.length,
    };
  }

  public async remove(artifact: ManagedFirmwareArtifact): Promise<void> {
    if (artifact.storageProvider === 'GCS') {
      await this.gcs
        .bucket(artifact.bucket)
        .file(artifact.objectKey)
        .delete({ ignoreNotFound: true });
      return;
    }
    await this.minio.removeObject(artifact.bucket, artifact.objectKey);
  }

  public async createDownloadUrl(release: FirmwareRelease): Promise<string> {
    const artifact = managedArtifact(release);
    if (artifact.storageProvider === 'GCS') {
      const [url] = await this.gcs
        .bucket(artifact.bucket)
        .file(artifact.objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + this.downloadUrlTtlSeconds * 1000,
        });
      return url;
    }
    return this.minio.presignedGetObject(
      artifact.bucket,
      artifact.objectKey,
      this.downloadUrlTtlSeconds,
    );
  }
}

function managedArtifact(release: FirmwareRelease): ManagedFirmwareArtifact {
  if (
    release.artifactStorageProvider === undefined ||
    release.artifactBucket === undefined ||
    release.artifactObjectKey === undefined ||
    release.artifactFileName === undefined ||
    release.artifactContentType === undefined ||
    release.artifactSizeBytes === undefined
  ) {
    throw DeviceError.stateConflict('Firmware release does not reference a managed artifact.');
  }
  return {
    storageProvider: release.artifactStorageProvider,
    bucket: release.artifactBucket,
    objectKey: release.artifactObjectKey,
    fileName: release.artifactFileName,
    contentType: release.artifactContentType,
    sizeBytes: release.artifactSizeBytes,
  };
}
