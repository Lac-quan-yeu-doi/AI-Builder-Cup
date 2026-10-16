import { Injectable } from '@nestjs/common';
import type { Client } from 'minio';

import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { secretRedactor } from '@application/shared/secret-redactor';
import {
  type ExecutionLogContent,
  type IExecutionLogStore,
  type ExecutionLogWriter,
} from '@application/execution-orchestration/interfaces/i-execution-log-store';
import type { LogLocation } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { ExecutionPortError } from '@application/execution-orchestration/errors/execution-port.error';

const LOG_CONTENT_TYPE = 'text/plain; charset=utf-8';

@Injectable()
export class MinioExecutionLogStore implements IExecutionLogStore {
  private readonly client: Client;

  public constructor(clients: MinioClientFactory) {
    this.client = clients.create();
  }

  public openWriter(location: LogLocation): ExecutionLogWriter {
    return new BufferedExecutionLogWriter(this.client, location);
  }

  public async read(location: LogLocation): Promise<ExecutionLogContent | undefined> {
    try {
      const stream = await this.client.getObject(location.bucket, location.objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks);
      return {
        bucket: location.bucket,
        objectKey: location.objectKey,
        text: content.toString('utf8'),
        byteSize: content.length,
      };
    } catch (error: unknown) {
      if (isMissingObjectError(error)) {
        return undefined;
      }
      throw ExecutionPortError.logStoreUnavailable();
    }
  }
}

class BufferedExecutionLogWriter implements ExecutionLogWriter {
  private buffer = '';
  private flushed = -1;
  private pending: Promise<void> = Promise.resolve();

  public constructor(
    private readonly client: Client,
    private readonly location: LogLocation,
  ) {}

  public append(chunk: string): void {
    this.buffer += secretRedactor.redact(chunk);
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
    if (this.buffer.length === this.flushed) {
      return;
    }
    const snapshot = this.buffer;
    const body = Buffer.from(snapshot, 'utf8');
    await this.client.putObject(this.location.bucket, this.location.objectKey, body, body.length, {
      'Content-Type': LOG_CONTENT_TYPE,
    });
    this.flushed = snapshot.length;
  }
}

function isMissingObjectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { readonly code?: unknown; readonly statusCode?: unknown };
  return (
    record.statusCode === 404 ||
    record.code === 'NoSuchKey' ||
    record.code === 'NoSuchObject' ||
    record.code === 'NotFound'
  );
}
