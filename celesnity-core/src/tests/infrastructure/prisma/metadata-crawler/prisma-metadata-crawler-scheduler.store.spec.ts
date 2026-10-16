import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import type { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaMetadataCrawlerSchedulerStore } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler-scheduler.store';

describe('PrismaMetadataCrawlerSchedulerStore', () => {
  it('returns zero when there are no due crawlers', async () => {
    const queryRaw = jest.fn(async () => []);
    const prisma = {
      transaction: jest.fn(),
      client: {
        $queryRaw: queryRaw,
        $executeRaw: jest.fn(),
      },
    } as unknown as PrismaService;
    const schedule = { next: jest.fn() };
    const store = new PrismaMetadataCrawlerSchedulerStore(
      prisma,
      {} as MetadataCrawlerMapper,
      schedule as never,
      {
        next: jest.fn(),
      },
    );

    await expect(store.scheduleDue(10, new Date('2026-08-18T01:00:00.000Z'))).resolves.toEqual([]);
    expect(prisma.transaction).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(schedule.next).not.toHaveBeenCalled();
  });

  it('returns inserted runs while staying inside the ambient transaction', async () => {
    const queuedRun = { id: '77777777-7777-4777-8777-777777777777' } as MetadataCrawlerRun;
    const mapper = {
      toDomainRun: jest.fn(() => queuedRun),
    } as unknown as MetadataCrawlerMapper;
    const queryRaw = jest.fn(async () => [
      {
        id: '11111111-1111-4111-8111-111111111111',
        schedule_cron: '0 1 * * *',
        schedule_timezone: 'UTC',
        next_run_at: new Date('2026-08-18T01:00:00.000Z'),
        revision: 3,
        discovery_config: { include: ['public'] },
        connector_type: 'POSTGRESQL',
      },
    ]);
    const executeRaw = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const findMany = jest.fn(async () => [{ id: queuedRun.id }]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      transaction: jest.fn(),
      client: {
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
        metadataCrawlerRun: { findFirst, findMany },
      },
    } as unknown as PrismaService;
    const schedule = {
      next: jest.fn(() => new Date('2026-08-19T01:00:00.000Z')),
    };
    const ids = { next: jest.fn(() => queuedRun.id) };
    const store = new PrismaMetadataCrawlerSchedulerStore(prisma, mapper, schedule as never, ids);

    await expect(store.scheduleDue(10, new Date('2026-08-18T01:00:00.000Z'))).resolves.toEqual([
      queuedRun,
    ]);
    expect(prisma.transaction).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(mapper.toDomainRun).toHaveBeenCalledWith({ id: queuedRun.id });
  });

  it('supersedes an abandoned queued run when the crawler reaches its next schedule', async () => {
    const replacementId = '77777777-7777-4777-8777-777777777777';
    const queuedRun = { id: replacementId } as MetadataCrawlerRun;
    const abandonedRun = MetadataCrawlerRun.rehydrate({
      id: '33333333-3333-4333-8333-333333333333',
      crawlerId: dueCrawler().id,
      triggerType: 'SCHEDULED',
      status: 'QUEUED',
      deduplicationKey: `${dueCrawler().id}:2026-08-17T01:00:00.000Z`,
      queuedAt: new Date('2026-08-17T01:00:00.000Z'),
      attempt: 0,
      crawlerRevision: 3,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: { include: ['public'] },
      counters: emptyCounters(),
    });
    const mapper = {
      toDomainRun: jest.fn((record) => (record.id === abandonedRun.id ? abandonedRun : queuedRun)),
      toRunPersistence: jest.fn((run) => ({ status: run.status, finishedAt: run.finishedAt })),
    } as unknown as MetadataCrawlerMapper;
    const queryRaw = jest.fn(async () => [dueCrawler()]);
    const findFirst = jest.fn().mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'QUEUED',
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const executeRaw = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const findMany = jest.fn(async () => [{ id: replacementId }]);
    const prisma = {
      transaction: jest.fn(),
      client: {
        $queryRaw: queryRaw,
        $executeRaw: executeRaw,
        metadataCrawlerRun: { findFirst, updateMany, findMany },
      },
    } as unknown as PrismaService;
    const schedule = { next: jest.fn(() => new Date('2026-08-19T01:00:00.000Z')) };
    const store = new PrismaMetadataCrawlerSchedulerStore(prisma, mapper, schedule as never, {
      next: () => replacementId,
    });

    await expect(store.scheduleDue(10, new Date('2026-08-18T01:00:00.000Z'))).resolves.toEqual([
      queuedRun,
    ]);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '33333333-3333-4333-8333-333333333333', status: 'QUEUED' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });
});

function dueCrawler() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organization_id: '22222222-2222-4222-8222-222222222222',
    schedule_cron: '0 1 * * *',
    schedule_timezone: 'UTC',
    next_run_at: new Date('2026-08-18T01:00:00.000Z'),
    revision: 3,
    discovery_config: { include: ['public'] },
    connector_type: 'POSTGRESQL',
  };
}

function emptyCounters() {
  return {
    databaseCount: 0,
    schemaCount: 0,
    relationCount: 0,
    columnCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    deletedCount: 0,
    warningCount: 0,
  };
}
