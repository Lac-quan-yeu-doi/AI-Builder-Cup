import { Injectable } from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type {
  IMetadataCrawlerRunQueue,
  MetadataCrawlerRecoveryResult,
} from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import {
  MetadataCrawlerRunStatus,
  type MetadataCrawlerRunStatusValue,
} from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import {
  MetadataCrawlerMapper,
  METADATA_CRAWLER_RUN_SELECTION,
} from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaErrorCode, hasPrismaErrorCode } from '@infrastructure/prisma/prisma-error';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import {
  lockMetadataCrawler,
  prepareCrawlerForReplacement,
} from '@infrastructure/prisma/metadata-crawler/metadata-crawler-run-supersession';

interface ClaimedRunId {
  readonly id: string;
}

@Injectable()
export class PrismaMetadataCrawlerRunQueue implements IMetadataCrawlerRunQueue {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MetadataCrawlerMapper,
    private readonly ids: IIdGenerator,
  ) {}

  public async enqueueManual(crawler: MetadataCrawler, now: Date): Promise<MetadataCrawlerRun> {
    await lockMetadataCrawler(this.prisma, crawler.id);
    const service = await this.prisma.client.databaseService.findUnique({
      where: { id: crawler.databaseServiceId },
      select: { connectorType: true },
    });
    if (service === null) {
      throw MetadataCrawlerError.notFound();
    }
    if (
      (await prepareCrawlerForReplacement(this.prisma, this.mapper, crawler.id, now)) === 'RUNNING'
    ) {
      throw MetadataCrawlerError.activeRunConflict();
    }

    const runId = this.ids.next();
    const run = MetadataCrawlerRun.queue({
      id: runId,
      crawlerId: crawler.id,
      triggerType: 'MANUAL',
      deduplicationKey: `manual:${runId}`,
      queuedAt: now,
      crawlerRevision: crawler.revision,
      connectorTypeSnapshot: service.connectorType,
      safeConfigSnapshot: crawler.discoveryConfig,
    });

    try {
      const record = await this.prisma.client.metadataCrawlerRun.create({
        data: this.mapper.toRunInsertPersistence(run),
        select: METADATA_CRAWLER_RUN_SELECTION,
      });
      return this.mapper.toDomainRun(record);
    } catch (error) {
      if (hasPrismaErrorCode(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw MetadataCrawlerError.activeRunConflict();
      }
      throw error;
    }
  }

  public async claim(
    limit: number,
    workerId: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<readonly MetadataCrawlerRun[]> {
    if (limit < 1) {
      return [];
    }
    const normalizedWorkerId = workerId.trim();
    if (normalizedWorkerId.length === 0) {
      throw MetadataCrawlerError.validation('Metadata crawler worker ID is required.');
    }

    return this.prisma.transaction(async (tx) => {
      const ids = await tx.$queryRaw<ClaimedRunId[]>(Prisma.sql`
        SELECT id
        FROM "celesnity_app"."metadata_crawler_runs"
        WHERE status = ${MetadataCrawlerRunStatus.QUEUED}::"celesnity_app"."MetadataCrawlerRunStatus"
        ORDER BY queued_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (ids.length === 0) {
        return [];
      }

      const records = await tx.metadataCrawlerRun.findMany({
        where: { id: { in: ids.map((row) => row.id) } },
        select: METADATA_CRAWLER_RUN_SELECTION,
      });
      const claimedIds: string[] = [];
      for (const record of records) {
        const run = this.mapper.toDomainRun(record);
        run.start({ workerId: normalizedWorkerId, leaseExpiresAt: leaseUntil }, now);
        const updated = await tx.metadataCrawlerRun.updateMany({
          where: { id: run.id, status: MetadataCrawlerRunStatus.QUEUED },
          data: this.mapper.toRunPersistence(run),
        });
        if (guardHeld(updated)) {
          claimedIds.push(run.id);
        }
      }

      if (claimedIds.length === 0) {
        return [];
      }
      const claimed = await tx.metadataCrawlerRun.findMany({
        where: { id: { in: claimedIds } },
        orderBy: [{ queuedAt: 'asc' }, { id: 'asc' }],
        select: METADATA_CRAWLER_RUN_SELECTION,
      });
      return claimed.map((record) => this.mapper.toDomainRun(record));
    });
  }

  public async claimById(
    runId: string,
    workerId: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<MetadataCrawlerRun | undefined> {
    const normalizedWorkerId = workerId.trim();
    if (normalizedWorkerId.length === 0) {
      throw MetadataCrawlerError.validation('Metadata crawler worker ID is required.');
    }

    return this.prisma.transaction(async (tx) => {
      const record = await tx.metadataCrawlerRun.findUnique({
        where: { id: runId },
        select: METADATA_CRAWLER_RUN_SELECTION,
      });
      if (record === null || record.status !== MetadataCrawlerRunStatus.QUEUED) {
        return undefined;
      }

      const run = this.mapper.toDomainRun(record);
      run.start({ workerId: normalizedWorkerId, leaseExpiresAt: leaseUntil }, now);
      const updated = await tx.metadataCrawlerRun.updateMany({
        where: { id: run.id, status: MetadataCrawlerRunStatus.QUEUED },
        data: this.mapper.toRunPersistence(run),
      });
      return guardHeld(updated) ? run : undefined;
    });
  }

  public async findStatus(runId: string): Promise<MetadataCrawlerRunStatusValue | undefined> {
    const record = await this.prisma.client.metadataCrawlerRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    return record?.status;
  }

  public async heartbeat(
    runId: string,
    workerId: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.client.metadataCrawlerRun.updateMany({
      where: {
        id: runId,
        status: MetadataCrawlerRunStatus.RUNNING,
        workerId: workerId.trim(),
        leaseExpiresAt: { gt: now },
      },
      data: { heartbeatAt: now, leaseExpiresAt: leaseUntil },
    });
    return guardHeld(result);
  }

  public async requeueExpired(
    maxAttempts: number,
    now: Date,
  ): Promise<MetadataCrawlerRecoveryResult> {
    if (maxAttempts < 1) {
      return { requeued: [], failed: 0 };
    }
    const expired = await this.prisma.client.metadataCrawlerRun.findMany({
      where: {
        status: MetadataCrawlerRunStatus.RUNNING,
        leaseExpiresAt: { lte: now },
        attempt: { lt: maxAttempts },
      },
      orderBy: [{ leaseExpiresAt: 'asc' }, { id: 'asc' }],
      select: METADATA_CRAWLER_RUN_SELECTION,
    });

    const requeued: MetadataCrawlerRun[] = [];
    for (const record of expired) {
      const run = this.mapper.toDomainRun(record);
      run.requeueAfterLeaseExpiry(now);
      const updated = await this.prisma.client.metadataCrawlerRun.updateMany({
        where: {
          id: run.id,
          status: MetadataCrawlerRunStatus.RUNNING,
          leaseExpiresAt: { lte: now },
        },
        data: this.mapper.toRunPersistence(run),
      });
      if (guardHeld(updated)) {
        requeued.push(run);
      }
    }

    const failed = await this.prisma.client.metadataCrawlerRun.updateMany({
      where: {
        status: MetadataCrawlerRunStatus.RUNNING,
        leaseExpiresAt: { lte: now },
        attempt: { gte: maxAttempts },
      },
      data: {
        status: MetadataCrawlerRunStatus.FAILED,
        finishedAt: now,
        heartbeatAt: null,
        leaseExpiresAt: null,
        workerId: null,
        errorCategory: 'INTERNAL',
        errorSummary: 'Metadata crawler lease expired after maximum attempts.',
      },
    });
    return { requeued, failed: failed.count };
  }
}
