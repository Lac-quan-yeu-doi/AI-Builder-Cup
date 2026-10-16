import { Prisma } from '@generated/prisma/client';
import type { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { METADATA_CRAWLER_RUN_SELECTION } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { guardHeld } from '@infrastructure/prisma/optimistic-concurrency';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { MetadataCrawlerError } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { MetadataCrawlerRunStatus } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

export type ActiveRunReplacementState = 'AVAILABLE' | 'RUNNING';

interface LockedCrawlerRow {
  readonly id: string;
}

/**
 * Locks the crawler so Run now and the scheduler serialize active-run changes.
 * Callers must already be inside the unit-of-work transaction that creates the
 * replacement run and records its outbox event.
 */
export async function lockMetadataCrawler(prisma: PrismaService, crawlerId: string): Promise<void> {
  const rows = await prisma.client.$queryRaw<LockedCrawlerRow[]>(Prisma.sql`
    SELECT id
    FROM "celesnity_app"."metadata_crawlers"
    WHERE id = ${crawlerId}::uuid
    FOR UPDATE
  `);
  if (rows.length === 0) {
    throw MetadataCrawlerError.notFound();
  }
}

/**
 * Makes room for a new run only when the existing active run never started.
 * A concurrent consumer may claim the run after it is read; the guarded update
 * then reports RUNNING instead of cancelling work that has begun.
 */
export async function prepareCrawlerForReplacement(
  prisma: PrismaService,
  mapper: MetadataCrawlerMapper,
  crawlerId: string,
  now: Date,
): Promise<ActiveRunReplacementState> {
  const active = await prisma.client.metadataCrawlerRun.findFirst({
    where: {
      crawlerId,
      status: { in: [MetadataCrawlerRunStatus.QUEUED, MetadataCrawlerRunStatus.RUNNING] },
    },
    select: METADATA_CRAWLER_RUN_SELECTION,
  });
  if (active === null) {
    return 'AVAILABLE';
  }
  if (active.status === MetadataCrawlerRunStatus.RUNNING) {
    return 'RUNNING';
  }

  const run = mapper.toDomainRun(active);
  run.cancel(now);
  const cancelled = await prisma.client.metadataCrawlerRun.updateMany({
    where: { id: run.id, status: MetadataCrawlerRunStatus.QUEUED },
    data: mapper.toRunPersistence(run),
  });
  return guardHeld(cancelled) ? 'AVAILABLE' : 'RUNNING';
}
