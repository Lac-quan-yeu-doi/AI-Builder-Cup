import { Injectable } from '@nestjs/common';

import type {
  IPipelineCompiledArtifactRepository,
  PipelineCompiledArtifactRecord,
} from '@application/pipeline-compilation/interfaces/i-pipeline-compiled-artifact-repository';
import {
  PIPELINE_COMPILED_ARTIFACT_SELECTION,
  PipelineCompiledArtifactMapper,
} from '@infrastructure/prisma/pipeline-compilation/pipeline-compiled-artifact.mapper';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaPipelineCompiledArtifactRepository implements IPipelineCompiledArtifactRepository {
  private readonly mapper = new PipelineCompiledArtifactMapper();

  public constructor(private readonly prisma: PrismaService) {}

  public async find(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineCompiledArtifactRecord | undefined> {
    const row = await this.prisma.client.pipelineCompiledArtifact.findFirst({
      where: { pipelineVersion: { pipelineId, versionNumber } },
      select: PIPELINE_COMPILED_ARTIFACT_SELECTION,
    });
    return row === null ? undefined : this.mapper.toApplication(row);
  }

  public async create(record: PipelineCompiledArtifactRecord): Promise<boolean> {
    try {
      await this.prisma.client.pipelineCompiledArtifact.create({
        data: this.mapper.toPersistence(record),
      });
      return true;
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) return false;
      throw error;
    }
  }
}
