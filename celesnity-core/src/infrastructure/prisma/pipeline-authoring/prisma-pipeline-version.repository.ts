import { Injectable } from '@nestjs/common';

import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type { PipelineVersionSnapshot } from '@domain/pipeline-authoring/models/pipeline-version';
import { PipelineMapper } from '@infrastructure/prisma/pipeline-authoring/pipeline.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaPipelineVersionRepository implements IPipelineVersionRepository {
  private readonly mapper = new PipelineMapper();

  public constructor(private readonly prisma: PrismaService) {}

  public async createSnapshot(snapshot: PipelineVersionSnapshot): Promise<void> {
    await this.prisma.client.pipelineVersion.create({
      data: {
        id: snapshot.id,
        pipelineId: snapshot.pipelineId,
        versionNumber: snapshot.versionNumber,
        graphSnapshot: this.mapper.graphInput(snapshot.graph),
        createdAt: new Date(snapshot.createdAt),
      },
    });
  }

  public async find(
    pipelineId: string,
    versionNumber: number,
  ): Promise<PipelineVersionSnapshot | undefined> {
    const record = await this.prisma.client.pipelineVersion.findUnique({
      where: { pipelineId_versionNumber: { pipelineId, versionNumber } },
    });
    if (record === null) return undefined;
    return {
      id: record.id,
      pipelineId: record.pipelineId,
      versionNumber: record.versionNumber,
      graph: this.mapper.graph(record.graphSnapshot),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
