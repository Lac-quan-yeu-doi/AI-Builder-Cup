import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Client, VersioningConfig } from 'minio';

import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import {
  type ArtifactStat,
  type ArtifactWriteIdentity,
  type ISourceArtifactStore,
} from '@application/script-authoring/interfaces/i-source-artifact-store';
import {
  type ArtifactLocation,
  ArtifactVersionId,
  type SourceHash,
} from '@domain/script-authoring/value-objects/script-value-objects';
import {
  ArtifactError,
  ArtifactErrorCode,
} from '@application/script-authoring/errors/artifact.error';

const TRANSIENT_STORAGE_CODES = new Set([
  'AbortError',
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ERR_SOCKET_CLOSED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ESOCKETTIMEDOUT',
  'ETIMEDOUT',
  'InternalError',
  'NetworkingError',
  'RequestTimeout',
  'RequestTimeoutException',
  'ServiceUnavailable',
  'SlowDown',
  'TimeoutError',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const STORAGE_AUTHORIZATION_CODES = new Set([
  'AccessDenied',
  'AuthorizationHeaderMalformed',
  'InvalidAccessKeyId',
  'InvalidToken',
  'SignatureDoesNotMatch',
]);

@Injectable()
export class MinioSourceArtifactStore implements ISourceArtifactStore {
  private readonly client: Client;

  public constructor(clients: MinioClientFactory) {
    this.client = clients.create();
  }

  public async putVerified(
    location: ArtifactLocation,
    content: Uint8Array,
    sourceHash: SourceHash,
  ): Promise<ArtifactWriteIdentity> {
    await this.requireVersioning(location.bucket);

    const body = Buffer.from(content);
    let uploaded: { readonly etag: string; readonly versionId: string | null };
    try {
      uploaded = await this.client.putObject(
        location.bucket,
        location.objectKey,
        body,
        body.length,
        {
          'Content-Type': 'text/x-python; charset=utf-8',
          'If-None-Match': '*',
          'x-amz-meta-content-sha256': sourceHash.value,
        },
      );
    } catch (error: unknown) {
      if (isPreconditionFailedError(error)) {
        return this.adoptExisting(location, sourceHash, body.length);
      }
      if (isTransientStorageError(error)) {
        return this.adoptAfterAmbiguousPut(location, sourceHash, body.length);
      }
      throw error;
    }

    if (uploaded.versionId === null || uploaded.versionId.trim() === '') {
      throw ArtifactError.versioningRequired();
    }
    const versionId = ArtifactVersionId.create(uploaded.versionId);
    const identity: ArtifactWriteIdentity = {
      versionId,
      etag: requireEtag(uploaded.etag),
      created: true,
    };

    try {
      const stat = await this.statExact(location, versionId);
      if (stat.etag !== identity.etag || stat.contentSize !== body.length) {
        throw ArtifactError.integrity();
      }
      await this.readVerified(location, versionId, sourceHash, body.length);
      return identity;
    } catch (error: unknown) {
      try {
        await this.removeExact(location, versionId);
      } catch {
        throw ArtifactError.cleanupFailed();
      }
      throw error;
    }
  }

  public async statExact(
    location: ArtifactLocation,
    versionId: ArtifactVersionId,
  ): Promise<ArtifactStat> {
    try {
      const stat = await this.client.statObject(location.bucket, location.objectKey, {
        versionId: versionId.value,
      });
      if (stat.versionId !== versionId.value) {
        throw ArtifactError.integrity();
      }
      return {
        versionId,
        etag: requireEtag(stat.etag),
        contentSize: stat.size,
      };
    } catch (error: unknown) {
      if (
        ArtifactError.is(error, ArtifactErrorCode.INTEGRITY, ArtifactErrorCode.STORAGE_UNAVAILABLE)
      ) {
        throw error;
      }
      if (isMissingObjectError(error)) {
        throw ArtifactError.missing();
      }
      if (isTransientStorageError(error)) {
        throw ArtifactError.storageUnavailable();
      }
      throw error;
    }
  }

  public async readVerified(
    location: ArtifactLocation,
    versionId: ArtifactVersionId,
    sourceHash: SourceHash,
    contentSize: number,
  ): Promise<Uint8Array> {
    try {
      const stat = await this.statExact(location, versionId);
      if (stat.contentSize !== contentSize) {
        throw ArtifactError.integrity();
      }

      const stream = await this.client.getObject(location.bucket, location.objectKey, {
        versionId: versionId.value,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const rawChunk of stream as AsyncIterable<unknown>) {
        const chunk = toBuffer(rawChunk);
        size += chunk.length;
        if (size > contentSize) {
          stream.destroy();
          throw ArtifactError.integrity();
        }
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks, size);
      const digest = createHash('sha256').update(content).digest('hex');
      if (content.length !== contentSize || digest !== sourceHash.value) {
        throw ArtifactError.integrity();
      }
      return content;
    } catch (error: unknown) {
      if (
        ArtifactError.is(
          error,
          ArtifactErrorCode.INTEGRITY,
          ArtifactErrorCode.MISSING,
          ArtifactErrorCode.STORAGE_UNAVAILABLE,
        )
      ) {
        throw error;
      }
      if (isMissingObjectError(error)) {
        throw ArtifactError.missing();
      }
      if (isTransientStorageError(error)) {
        throw ArtifactError.storageUnavailable();
      }
      throw error;
    }
  }

  public async removeExact(
    location: ArtifactLocation,
    versionId: ArtifactVersionId,
  ): Promise<void> {
    try {
      await this.client.removeObject(location.bucket, location.objectKey, {
        versionId: versionId.value,
      });
    } catch (error: unknown) {
      if (isMissingObjectError(error)) {
        return;
      }
      if (isTransientStorageError(error)) {
        throw ArtifactError.storageUnavailable();
      }
      throw error;
    }
  }

  private async adoptAfterAmbiguousPut(
    location: ArtifactLocation,
    sourceHash: SourceHash,
    contentSize: number,
  ): Promise<ArtifactWriteIdentity> {
    try {
      return await this.adoptExisting(location, sourceHash, contentSize);
    } catch {
      throw ArtifactError.storageUnavailable();
    }
  }

  private async adoptExisting(
    location: ArtifactLocation,
    sourceHash: SourceHash,
    contentSize: number,
  ): Promise<ArtifactWriteIdentity> {
    let latest: ArtifactStat;
    try {
      latest = await this.statLatest(location);
    } catch (error: unknown) {
      if (ArtifactError.is(error, ArtifactErrorCode.MISSING)) {
        throw ArtifactError.integrity();
      }
      throw error;
    }
    if (latest.contentSize !== contentSize) {
      throw ArtifactError.alreadyExists();
    }

    try {
      await this.readVerified(location, latest.versionId, sourceHash, contentSize);
    } catch (error: unknown) {
      if (ArtifactError.is(error, ArtifactErrorCode.INTEGRITY)) {
        throw ArtifactError.alreadyExists();
      }
      if (ArtifactError.is(error, ArtifactErrorCode.MISSING)) {
        throw ArtifactError.integrity();
      }
      throw error;
    }
    return { ...latest, created: false };
  }

  private async statLatest(location: ArtifactLocation): Promise<ArtifactStat> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.statLatestOnce(location);
      } catch (error: unknown) {
        if (!ArtifactError.is(error, ArtifactErrorCode.STORAGE_UNAVAILABLE) || attempt === 1) {
          throw error;
        }
      }
    }
    throw ArtifactError.storageUnavailable();
  }

  private async statLatestOnce(location: ArtifactLocation): Promise<ArtifactStat> {
    try {
      const stat = await this.client.statObject(location.bucket, location.objectKey);
      if (stat.versionId === undefined || stat.versionId === null || stat.versionId.trim() === '') {
        throw ArtifactError.integrity();
      }
      return {
        versionId: ArtifactVersionId.create(stat.versionId),
        etag: requireEtag(stat.etag),
        contentSize: stat.size,
      };
    } catch (error: unknown) {
      if (
        ArtifactError.is(error, ArtifactErrorCode.INTEGRITY, ArtifactErrorCode.STORAGE_UNAVAILABLE)
      ) {
        throw error;
      }
      if (isMissingObjectError(error)) {
        throw ArtifactError.missing();
      }
      if (isTransientStorageError(error)) {
        throw ArtifactError.storageUnavailable();
      }
      throw error;
    }
  }

  private async requireVersioning(bucket: string): Promise<void> {
    let configuration: VersioningConfig;
    try {
      configuration = await this.client.getBucketVersioning(bucket);
    } catch (error: unknown) {
      if (isTransientStorageError(error) || isStorageAuthorizationError(error)) {
        throw ArtifactError.storageUnavailable();
      }
      throw ArtifactError.versioningRequired();
    }
    if (configuration.Status !== 'Enabled') {
      throw ArtifactError.versioningRequired();
    }
  }
}

function requireEtag(value: string): string {
  const normalized = value.trim().replace(/^"|"$/gu, '');
  if (normalized === '') {
    throw ArtifactError.integrity();
  }
  return normalized;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    return Buffer.from(value);
  }
  throw ArtifactError.integrity();
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
    record.code === 'NoSuchVersion' ||
    record.code === 'NotFound'
  );
}

function isPreconditionFailedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { readonly code?: unknown; readonly statusCode?: unknown };
  return record.statusCode === 412 || record.code === 'PreconditionFailed';
}

function isTransientStorageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as {
    readonly cause?: unknown;
    readonly code?: unknown;
    readonly name?: unknown;
    readonly statusCode?: unknown;
  };
  const statusCode = typeof record.statusCode === 'number' ? record.statusCode : undefined;
  if (statusCode === 408 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
    return true;
  }
  if (
    (typeof record.code === 'string' && TRANSIENT_STORAGE_CODES.has(record.code)) ||
    (typeof record.name === 'string' && TRANSIENT_STORAGE_CODES.has(record.name))
  ) {
    return true;
  }
  return record.cause !== undefined && record.cause !== error
    ? isTransientStorageError(record.cause)
    : false;
}

function isStorageAuthorizationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { readonly code?: unknown; readonly statusCode?: unknown };
  return (
    record.statusCode === 401 ||
    (typeof record.code === 'string' && STORAGE_AUTHORIZATION_CODES.has(record.code))
  );
}
