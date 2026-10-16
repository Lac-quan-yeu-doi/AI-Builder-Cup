import { Injectable } from '@nestjs/common';

import { guardLost } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { activeScriptAtRevision } from '@infrastructure/prisma/script-authoring/script-criteria';
import type {
  PersistedScriptVersion,
  PublishScriptVersionRequest,
  IScriptVersionRepository,
} from '@application/script-authoring/interfaces/i-script-version-repository';
import { ScriptError, ScriptErrorCode } from '@domain/script-authoring/errors/script.errors';
import type { ScriptVersionId } from '@domain/script-authoring/value-objects/script-value-objects';

@Injectable()
export class PrismaScriptVersionRepository implements IScriptVersionRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async publish(request: PublishScriptVersionRequest): Promise<void> {
    const client = this.prisma.client;
    try {
      await client.scriptVersion.create({
        data: {
          id: request.version.id.value,
          scriptId: request.scriptId.value,
          versionNumber: request.version.versionNumber.value,
          objectKey: request.version.artifactLocation.objectKey,
          objectVersionId: request.version.artifactVersionId.value,
          contentSha256: request.version.sourceHash.value,
          contentSize: request.version.contentSize,
          publishedAt: request.version.publishedAt,
        },
      });

      const updated = await client.script.updateMany({
        where: {
          ...activeScriptAtRevision({
            scriptId: request.scriptId.value,
            expectedRevision: request.expectedRevision,
          }),
          // Publication additionally pins the version it is advancing from, so two
          // concurrent publishes cannot both believe they are the next version.
          currentVersionId: request.expectedCurrentVersionId?.value ?? null,
        },
        data: {
          currentVersionId: request.version.id.value,
          revision: request.revision,
          updatedAt: request.version.publishedAt,
        },
      });
      if (guardLost(updated)) {
        throw ScriptError.publicationConflict();
      }
    } catch (error: unknown) {
      if (error instanceof ScriptError && error.code === ScriptErrorCode.PUBLICATION_CONFLICT) {
        throw error;
      }
      if (
        hasPrismaErrorCode(
          error,
          PrismaErrorCode.UNIQUE_VIOLATION,
          PrismaErrorCode.FOREIGN_KEY_VIOLATION,
        )
      ) {
        throw ScriptError.publicationConflict();
      }
      throw error;
    }
  }

  public async findById(id: ScriptVersionId): Promise<PersistedScriptVersion | undefined> {
    const record = await this.prisma.client.scriptVersion.findUnique({
      where: { id: id.value },
      select: {
        id: true,
        scriptId: true,
        versionNumber: true,
        objectKey: true,
        objectVersionId: true,
        contentSha256: true,
        contentSize: true,
        publishedAt: true,
        script: { select: { artifactBucket: true, currentVersionId: true, revision: true } },
      },
    });
    if (record === null) {
      return undefined;
    }
    return {
      id: record.id,
      scriptId: record.scriptId,
      versionNumber: record.versionNumber,
      artifactBucket: record.script.artifactBucket,
      objectKey: record.objectKey,
      objectVersionId: record.objectVersionId,
      contentSha256: record.contentSha256,
      contentSize: record.contentSize,
      publishedAt: record.publishedAt,
      currentVersionId: record.script.currentVersionId,
      revision: record.script.revision,
    };
  }
}
