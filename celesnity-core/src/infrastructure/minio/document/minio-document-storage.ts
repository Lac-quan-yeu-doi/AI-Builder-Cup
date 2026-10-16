import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';

import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import type { IDocumentStorage } from '@application/document/interfaces/i-document-storage';

/**
 * Stores original uploaded document bytes in the same bucket already used
 * for build artifacts (`MINIO_ARTIFACTS_BUCKET`), under a `documents/`
 * prefix — one bucket, several purposes, matching the existing convention
 * (see `MinioMetadataCrawlerLogStore`). Kept for reference/re-extraction
 * only: the extracted text callers actually read lives in Postgres via
 * `PrismaDocumentRepository`, not here.
 */
@Injectable()
export class MinioDocumentStorage implements IDocumentStorage {
  private readonly client: Client;
  private readonly bucket: string;

  public constructor(clients: MinioClientFactory, config: ConfigService) {
    this.client = clients.create();
    this.bucket = config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET');
  }

  public async put(storageKey: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    const body = Buffer.from(bytes);
    await this.client.putObject(this.bucket, storageKey, body, body.length, {
      'Content-Type': mimeType,
    });
  }

  public async get(storageKey: string): Promise<Uint8Array> {
    const stream = await this.client.getObject(this.bucket, storageKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 20 * 1024 * 1024) {
        stream.destroy();
        throw new Error('Stored document exceeds the 20 MiB limit.');
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
}
