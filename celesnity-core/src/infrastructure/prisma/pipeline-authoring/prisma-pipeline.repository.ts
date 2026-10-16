import { Injectable } from '@nestjs/common';
import type { Prisma } from '@generated/prisma/client';

import type {
  IPipelineRepository,
  PipelineCountQuery,
  PipelineListQuery,
  PipelineSaveResult,
} from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { Pipeline } from '@domain/pipeline-authoring/models/pipeline';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import {
  PIPELINE_SELECTION,
  PipelineMapper,
} from '@infrastructure/prisma/pipeline-authoring/pipeline.mapper';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaPipelineRepository implements IPipelineRepository {
  private readonly mapper = new PipelineMapper();

  public constructor(private readonly prisma: PrismaService) {}

  public async list(query: PipelineListQuery): Promise<readonly Pipeline[]> {
    const records = await this.prisma.client.pipeline.findMany({
      where: this.where(query),
      orderBy: { [query.sortBy]: query.sortDirection.toLowerCase() },
      skip: query.skip,
      take: query.take,
      select: PIPELINE_SELECTION,
    });
    return records.map((record) => this.mapper.toDomain(record));
  }

  public count(query: PipelineCountQuery): Promise<number> {
    return this.prisma.client.pipeline.count({ where: this.where(query) });
  }

  public async findActiveById(id: string): Promise<Pipeline | undefined> {
    const record = await this.prisma.client.pipeline.findFirst({
      where: { id, archivedAt: null },
      select: PIPELINE_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async existsActiveByName(name: string, excludingId?: string): Promise<boolean> {
    return (
      (await this.prisma.client.pipeline.count({
        where: {
          name: { equals: name, mode: 'insensitive' },
          archivedAt: null,
          ...(excludingId === undefined ? {} : { id: { not: excludingId } }),
        },
      })) > 0
    );
  }

  public async create(pipeline: Pipeline): Promise<boolean> {
    try {
      await this.prisma.client.pipeline.create({ data: this.createData(pipeline) });
      return true;
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return false;
      }
      throw error;
    }
  }

  public async update(pipeline: Pipeline, expectedVersion: number): Promise<PipelineSaveResult> {
    try {
      const result = await this.prisma.client.pipeline.updateMany({
        where: { id: pipeline.id, version: expectedVersion, archivedAt: null },
        data: {
          name: pipeline.name,
          databaseName: pipeline.databaseName ?? null,
          description: pipeline.description ?? null,
          graph: this.mapper.graphInput(pipeline.graph),
          version: pipeline.version,
          updatedAt: new Date(pipeline.updatedAt),
        },
      });
      return result.count === 1 ? 'SAVED' : 'VERSION_CONFLICT';
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        return 'NAME_CONFLICT';
      }
      throw error;
    }
  }

  public async archive(id: string, archivedAt: string): Promise<boolean> {
    const result = await this.prisma.client.pipeline.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date(archivedAt), updatedAt: new Date(archivedAt) },
    });
    return result.count === 1;
  }

  private where(query: PipelineCountQuery): Prisma.PipelineWhereInput {
    return {
      archivedAt: null,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.keyword === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }),
    };
  }

  private createData(pipeline: Pipeline): Prisma.PipelineCreateInput {
    return {
      id: pipeline.id,
      name: pipeline.name,
      databaseName: pipeline.databaseName ?? null,
      description: pipeline.description,
      status: pipeline.status,
      version: pipeline.version,
      graph: this.mapper.graphInput(pipeline.graph),
      createdById: pipeline.createdBy.id,
      createdByDisplayName: pipeline.createdBy.displayName,
      createdAt: new Date(pipeline.createdAt),
      updatedAt: new Date(pipeline.updatedAt),
    };
  }
}
