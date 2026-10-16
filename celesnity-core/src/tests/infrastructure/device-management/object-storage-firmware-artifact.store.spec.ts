import type { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';

import { ObjectStorageFirmwareArtifactStore } from '@infrastructure/device-management/object-storage-firmware-artifact.store';
import type { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';

describe('ObjectStorageFirmwareArtifactStore', () => {
  it('stores private firmware bytes under an organization and release key', async () => {
    const putObject = jest.fn().mockResolvedValue({ etag: 'etag' });
    const client = {
      putObject,
      presignedGetObject: jest.fn(),
      removeObject: jest.fn(),
    } as unknown as Client;
    const store = createStore(client);

    const artifact = await store.put({
      organizationId: '20000000-0000-4000-8000-000000000001',
      releaseId: '40000000-0000-4000-8000-000000000001',
      fileName: 'gateway-1.2.0.bin',
      contentType: 'application/octet-stream',
      bytes: new Uint8Array([1, 2, 3]),
      sha256: 'a'.repeat(64),
    });

    expect(artifact).toEqual({
      storageProvider: 'MINIO',
      bucket: 'celesnity-artifacts',
      objectKey:
        'firmware/20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/artifact',
      fileName: 'gateway-1.2.0.bin',
      contentType: 'application/octet-stream',
      sizeBytes: 3,
    });
    expect(putObject).toHaveBeenCalledWith(
      'celesnity-artifacts',
      artifact.objectKey,
      Buffer.from([1, 2, 3]),
      3,
      expect.objectContaining({ 'Cache-Control': 'private, no-store' }),
    );
  });

  it('creates a short-lived URL without exposing storage credentials', async () => {
    const presignedGetObject = jest.fn().mockResolvedValue('http://minio:9000/signed');
    const client = {
      putObject: jest.fn(),
      presignedGetObject,
      removeObject: jest.fn(),
    } as unknown as Client;
    const store = createStore(client);

    const url = await store.createDownloadUrl({
      id: '40000000-0000-4000-8000-000000000001',
      organizationId: '20000000-0000-4000-8000-000000000001',
      version: '1.2.0',
      deviceModel: 'Edge Gateway',
      artifactStorageProvider: 'MINIO',
      artifactBucket: 'celesnity-artifacts',
      artifactObjectKey: 'firmware/org/release/artifact',
      artifactFileName: 'gateway.bin',
      artifactContentType: 'application/octet-stream',
      artifactSizeBytes: 3,
      sha256: 'a'.repeat(64),
      signature: 'A'.repeat(88),
      createdBy: 'owner-1',
      createdAt: '2026-09-05T00:00:00.000Z',
    });

    expect(url).toBe('http://minio:9000/signed');
    expect(presignedGetObject).toHaveBeenCalledWith(
      'celesnity-artifacts',
      'firmware/org/release/artifact',
      900,
    );
  });
});

function createStore(client: Client): ObjectStorageFirmwareArtifactStore {
  const clients = { create: () => client } as MinioClientFactory;
  const values: Record<string, unknown> = {
    FIRMWARE_ARTIFACT_STORAGE_PROVIDER: 'MINIO',
    FIRMWARE_ARTIFACTS_BUCKET: 'celesnity-artifacts',
    FIRMWARE_DOWNLOAD_URL_TTL_SECONDS: 900,
  };
  const config = {
    getOrThrow: <T>(key: string): T => values[key] as T,
  } as ConfigService;
  return new ObjectStorageFirmwareArtifactStore(clients, config);
}
