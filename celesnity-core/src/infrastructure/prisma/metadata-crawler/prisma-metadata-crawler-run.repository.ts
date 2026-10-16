import { Injectable } from '@nestjs/common';

import type { IMetadataCrawlerRunRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-repository';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type { MetadataCrawlerRunStatusValue } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Persists a worker-owned run with a status guard.  The guard is deliberately
 * separate from the queue: claiming and heartbeats are queue concerns, while
 * terminal state writes must never overwrite a lease recovered by another
 * worker.
 */
@Injectable()
export class PrismaMetadataCrawlerRunRepository implements IMetadataCrawlerRunRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MetadataCrawlerMapper,
  ) {}

  public async update(
    run: MetadataCrawlerRun,
    expectedStatus: MetadataCrawlerRunStatusValue,
  ): Promise<boolean> {
    const result = await this.prisma.client.metadataCrawlerRun.updateMany({
      where: { id: run.id, status: expectedStatus },
      data: this.mapper.toRunPersistence(run),
    });
    return guardHeld(result);
  }
}
