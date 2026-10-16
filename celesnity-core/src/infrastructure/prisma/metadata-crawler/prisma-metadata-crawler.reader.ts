import { Injectable } from '@nestjs/common';

import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type {
  MetadataCrawlerRunView,
  MetadataCrawlerView,
} from '@application/metadata-crawler/read-models/metadata-crawler.view';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  METADATA_CRAWLER_RUN_SELECTION,
  METADATA_CRAWLER_SELECTION,
  MetadataCrawlerMapper,
} from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';

@Injectable()
export class PrismaMetadataCrawlerReader implements IMetadataCrawlerReader {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MetadataCrawlerMapper,
  ) {}

  public async list(includeArchived = false): Promise<readonly MetadataCrawlerView[]> {
    const records = await this.prisma.client.metadataCrawler.findMany({
      where: includeArchived ? undefined : { archivedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: METADATA_CRAWLER_SELECTION,
    });
    return records.map((record) => this.mapper.toView(record));
  }

  public async findById(id: string): Promise<MetadataCrawlerView | undefined> {
    const record = await this.prisma.client.metadataCrawler.findUnique({
      where: { id },
      select: METADATA_CRAWLER_SELECTION,
    });
    return record === null ? undefined : this.mapper.toView(record);
  }

  public async listRuns(crawlerId: string, limit = 50): Promise<readonly MetadataCrawlerRunView[]> {
    const records = await this.prisma.client.metadataCrawlerRun.findMany({
      where: { crawlerId },
      orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(limit, 200)),
      select: METADATA_CRAWLER_RUN_SELECTION,
    });
    return records.map((record) => this.mapper.toRunView(record));
  }

  public async findRunById(runId: string): Promise<MetadataCrawlerRunView | undefined> {
    const record = await this.prisma.client.metadataCrawlerRun.findUnique({
      where: { id: runId },
      select: METADATA_CRAWLER_RUN_SELECTION,
    });
    return record === null ? undefined : this.mapper.toRunView(record);
  }
}
