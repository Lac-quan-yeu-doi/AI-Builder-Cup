import type { Client } from 'minio';

import { ArtifactErrorCode } from '@application/script-authoring/errors/artifact.error';
import {
  ArtifactLocation,
  SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';
import type { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioSourceArtifactStore } from '@infrastructure/minio/script-authoring/minio-source-artifact.store';

describe('MinioSourceArtifactStore', () => {
  const location = ArtifactLocation.create('artifacts', 'scripts/test/versions/1/main.py');
  const sourceHash = SourceHash.fromSha256('a'.repeat(64));

  function storeWith(client: Pick<Client, 'getBucketVersioning' | 'putObject'>) {
    const clients = { create: () => client } as unknown as MinioClientFactory;
    return new MinioSourceArtifactStore(clients);
  }

  it('classifies a rejected storage credential as storage unavailable', async () => {
    const client = {
      getBucketVersioning: jest.fn().mockRejectedValue({
        code: 'SignatureDoesNotMatch',
        statusCode: 403,
      }),
      putObject: jest.fn(),
    };

    await expect(
      storeWith(client).putVerified(location, Buffer.from('print("hello")'), sourceHash),
    ).rejects.toMatchObject({ code: ArtifactErrorCode.STORAGE_UNAVAILABLE });
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it('retains the versioning-required classification for a disabled bucket', async () => {
    const client = {
      getBucketVersioning: jest.fn().mockResolvedValue({ Status: 'Suspended' }),
      putObject: jest.fn(),
    };

    await expect(
      storeWith(client).putVerified(location, Buffer.from('print("hello")'), sourceHash),
    ).rejects.toMatchObject({ code: ArtifactErrorCode.VERSIONING_REQUIRED });
    expect(client.putObject).not.toHaveBeenCalled();
  });
});
