import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'minio';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { secretRedactor } from '@application/shared/secret-redactor';
import type {
  IMetadataCrawlerLogStore,
  MetadataCrawlerLogContent,
  MetadataCrawlerLogWriter,
} from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';

const MAX_LOG_BYTES = 1_048_576;
const LOG_CONTENT_TYPE = 'text/plain; charset=utf-8';

@Injectable()
export class MinioMetadataCrawlerLogStore implements IMetadataCrawlerLogStore {
  private readonly client: Client;
  private readonly bucket: string;

  public constructor(clients: MinioClientFactory, config: ConfigService) {
    this.client = clients.create();
    this.bucket = config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET');
  }

  public openWriter(crawlerId: string, runId: string): MetadataCrawlerLogWriter {
    return new BufferedMetadataCrawlerLogWriter(
      this.client,
      this.bucket,
      objectKey(crawlerId, runId),
    );
  }

  public async read(
    crawlerId: string,
    runId: string,
  ): Promise<MetadataCrawlerLogContent | undefined> {
    try {
      const stream = await this.client.getObject(this.bucket, objectKey(crawlerId, runId));
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_LOG_BYTES - total;
        if (remaining <= 0) break;
        chunks.push(buffer.subarray(0, remaining));
        total += Math.min(buffer.length, remaining);
      }
      const text = secretRedactor.redact(Buffer.concat(chunks).toString('utf8'));
      return { text, byteSize: Buffer.byteLength(text, 'utf8') };
    } catch (error) {
      if (isMissingObjectError(error)) return undefined;
      throw error;
    }
  }
}

class BufferedMetadataCrawlerLogWriter implements MetadataCrawlerLogWriter {
  private buffer = '';
  private flushedBytes = -1;
  private pending: Promise<void> = Promise.resolve();

  public constructor(
    private readonly client: Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {}

  public append(chunk: string): void {
    if (Buffer.byteLength(this.buffer, 'utf8') >= MAX_LOG_BYTES) return;
    const redacted = secretRedactor.redact(chunk);
    const remaining = MAX_LOG_BYTES - Buffer.byteLength(this.buffer, 'utf8');
    this.buffer += Buffer.from(redacted, 'utf8').subarray(0, remaining).toString('utf8');
  }

  public flush(): Promise<void> {
    this.pending = this.pending.then(() => this.persist());
    return this.pending;
  }

  public async finalize(): Promise<number> {
    await this.flush();
    return Buffer.byteLength(this.buffer, 'utf8');
  }

  private async persist(): Promise<void> {
    const bytes = Buffer.byteLength(this.buffer, 'utf8');
    if (bytes === this.flushedBytes) return;
    const body = Buffer.from(this.buffer, 'utf8');
    await this.client.putObject(this.bucket, this.key, body, body.length, {
      'Content-Type': LOG_CONTENT_TYPE,
    });
    this.flushedBytes = bytes;
  }
}

function objectKey(crawlerId: string, runId: string): string {
  return `metadata-crawlers/${crawlerId}/runs/${runId}/crawler.log`;
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { readonly code?: unknown; readonly statusCode?: unknown };
  return (
    record.statusCode === 404 ||
    record.code === 'NoSuchKey' ||
    record.code === 'NoSuchObject' ||
    record.code === 'NotFound'
  );
}
