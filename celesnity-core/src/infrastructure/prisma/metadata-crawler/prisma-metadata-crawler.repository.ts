import { Injectable } from '@nestjs/common';

import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import {
  MetadataCrawlerMapper,
  METADATA_CRAWLER_SELECTION,
} from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaMetadataCrawlerRepository implements IMetadataCrawlerRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MetadataCrawlerMapper,
  ) {}

  public async create(crawler: MetadataCrawler): Promise<void> {
    const organizationId = this.prisma.organizationId;
    if (organizationId === undefined) {
      throw new Error('Metadata crawler assignment requires an authenticated organization.');
    }
    try {
      await this.prisma.client.metadataCrawler.create({
        data: {
          ...this.mapper.toInsertPersistence(crawler),
          databaseMetadataCrawler: {
            // Prisma query extensions do not rewrite nested creates. Connect
            // the nested assignment to its organization explicitly instead of
            // allowing PostgreSQL to apply DEFAULT_ORGANIZATION_ID.
            create: {
              databaseService: { connect: { id: crawler.databaseServiceId } },
              organization: { connect: { id: organizationId } },
            },
          },
        },
      });
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw MetadataCrawlerError.assignmentConflict();
      }
      throw error;
    }
  }

  public async update(crawler: MetadataCrawler, expectedUpdatedAt: Date): Promise<boolean> {
    const result = await this.prisma.client.metadataCrawler.updateMany({
      where: { id: crawler.id, updatedAt: expectedUpdatedAt },
      data: this.mapper.toPersistence(crawler),
    });
    return guardHeld(result);
  }

  public async findById(id: string): Promise<MetadataCrawler | undefined> {
    const record = await this.prisma.client.metadataCrawler.findUnique({
      where: { id },
      select: METADATA_CRAWLER_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }

  public async findByDatabaseServiceId(
    databaseServiceId: string,
  ): Promise<MetadataCrawler | undefined> {
    const record = await this.prisma.client.metadataCrawler.findFirst({
      where: { databaseMetadataCrawler: { databaseServiceId } },
      select: METADATA_CRAWLER_SELECTION,
    });
    return record === null ? undefined : this.mapper.toDomain(record);
  }
}
