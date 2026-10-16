import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import { MetadataCrawlerErrorCode } from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { MetadataCrawlerRunStatus } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaMetadataCrawlerRunQueue } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler-run.queue';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const REPLACEMENT_RUN_ID = '44444444-4444-4444-8444-444444444444';

function crawler(): MetadataCrawler {
  return MetadataCrawler.create({
    id: CRAWLER_ID,
    databaseServiceId: DATABASE_SERVICE_ID,
    name: 'Orders crawler',
    scheduleCron: '0 1 * * *',
    scheduleTimezone: 'UTC',
    nextRunAt: new Date('2026-08-19T01:00:00.000Z'),
    discoveryConfig: { includeSchemas: ['public'] },
    now: NOW,
  });
}

describe('PrismaMetadataCrawlerRunQueue', () => {
  it('creates a manual run with a safe connector snapshot', async () => {
    const create = jest.fn().mockResolvedValue({
      id: RUN_ID,
      crawlerId: CRAWLER_ID,
      triggerType: 'MANUAL',
      status: 'QUEUED',
      deduplicationKey: `manual:${RUN_ID}`,
      scheduledFor: null,
      queuedAt: NOW,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: { includeSchemas: ['public'] },
      databaseCount: 0,
      schemaCount: 0,
      relationCount: 0,
      columnCount: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      deletedCount: 0,
      warningCount: 0,
      errorCategory: null,
      errorSummary: null,
      logObjectKey: null,
      createdAt: NOW,
    });
    const prisma = {
      client: {
        $queryRaw: jest.fn().mockResolvedValue([{ id: CRAWLER_ID }]),
        databaseService: {
          findUnique: jest.fn().mockResolvedValue({ connectorType: 'POSTGRESQL' }),
        },
        metadataCrawlerRun: { findFirst: jest.fn().mockResolvedValue(null), create },
      },
    } as unknown as PrismaService;
    const ids: IIdGenerator = { next: () => RUN_ID };
    const mapper = {
      toRunInsertPersistence: jest.fn().mockImplementation((run) => ({
        id: run.id,
        crawlerId: run.crawlerId,
        status: run.status,
        triggerType: run.triggerType,
        connectorTypeSnapshot: run.connectorTypeSnapshot,
        safeConfigSnapshot: run.safeConfigSnapshot,
      })),
      toDomainRun: jest.fn().mockImplementation((record) => record),
    } as unknown as MetadataCrawlerMapper;
    const queue = new PrismaMetadataCrawlerRunQueue(prisma, mapper, ids);

    const run = await queue.enqueueManual(crawler(), NOW);

    expect(run.status).toBe(MetadataCrawlerRunStatus.QUEUED);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: RUN_ID,
          crawlerId: CRAWLER_ID,
          status: 'QUEUED',
          triggerType: 'MANUAL',
          connectorTypeSnapshot: 'POSTGRESQL',
          safeConfigSnapshot: { includeSchemas: ['public'] },
        }),
      }),
    );
    expect(JSON.stringify(create.mock.calls[0])).not.toContain('password');
  });

  it('cancels an abandoned queued run before creating a fresh manual run', async () => {
    const abandoned = queuedRun(RUN_ID);
    const replacement = queuedRun(REPLACEMENT_RUN_ID);
    const lockCrawler = jest.fn().mockResolvedValue([{ id: CRAWLER_ID }]);
    const findFirst = jest.fn().mockResolvedValue(abandoned);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue(replacement);
    const prisma = {
      client: {
        $queryRaw: lockCrawler,
        databaseService: {
          findUnique: jest.fn().mockResolvedValue({ connectorType: 'POSTGRESQL' }),
        },
        metadataCrawlerRun: {
          findFirst,
          updateMany,
          create,
        },
      },
    } as unknown as PrismaService;
    const abandonedRun = MetadataCrawlerRun.rehydrate({
      id: RUN_ID,
      crawlerId: CRAWLER_ID,
      triggerType: 'MANUAL',
      status: 'QUEUED',
      deduplicationKey: `manual:${RUN_ID}`,
      queuedAt: NOW,
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: { includeSchemas: ['public'] },
      counters: emptyCounters(),
    });
    const mapper = {
      toRunInsertPersistence: jest.fn((run) => ({ id: run.id, status: run.status })),
      toRunPersistence: jest.fn((run) => ({ status: run.status, finishedAt: run.finishedAt })),
      toDomainRun: jest.fn((record) => (record.id === RUN_ID ? abandonedRun : replacement)),
    } as unknown as MetadataCrawlerMapper;
    const queue = new PrismaMetadataCrawlerRunQueue(prisma, mapper, {
      next: () => REPLACEMENT_RUN_ID,
    });

    await expect(queue.enqueueManual(crawler(), NOW)).resolves.toBe(replacement);

    expect(lockCrawler).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          crawlerId: CRAWLER_ID,
          status: { in: ['QUEUED', 'RUNNING'] },
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: RUN_ID, status: 'QUEUED' },
      data: { status: 'CANCELLED', finishedAt: NOW },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: REPLACEMENT_RUN_ID, status: 'QUEUED' } }),
    );
  });

  it('keeps a running run intact instead of replacing it', async () => {
    const prisma = {
      client: {
        $queryRaw: jest.fn().mockResolvedValue([{ id: CRAWLER_ID }]),
        databaseService: {
          findUnique: jest.fn().mockResolvedValue({ connectorType: 'POSTGRESQL' }),
        },
        metadataCrawlerRun: {
          findFirst: jest.fn().mockResolvedValue({ id: RUN_ID, status: 'RUNNING' }),
          updateMany: jest.fn(),
          create: jest.fn(),
        },
      },
    } as unknown as PrismaService;
    const mapper = {
      toRunInsertPersistence: jest.fn(),
      toDomainRun: jest.fn(),
    } as unknown as MetadataCrawlerMapper;
    const queue = new PrismaMetadataCrawlerRunQueue(prisma, mapper, { next: () => RUN_ID });

    await expect(queue.enqueueManual(crawler(), NOW)).rejects.toMatchObject({
      code: MetadataCrawlerErrorCode.ACTIVE_RUN_CONFLICT,
    });
    expect(prisma.client.metadataCrawlerRun.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.metadataCrawlerRun.create).not.toHaveBeenCalled();
  });

  it('claims one queued run by its event run ID', async () => {
    const record = {
      id: RUN_ID,
      crawlerId: CRAWLER_ID,
      triggerType: 'MANUAL',
      status: 'QUEUED',
      deduplicationKey: `manual:${RUN_ID}`,
      scheduledFor: null,
      queuedAt: NOW,
      claimedAt: null,
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      workerId: null,
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: {},
      databaseCount: 0,
      schemaCount: 0,
      relationCount: 0,
      columnCount: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      deletedCount: 0,
      warningCount: 0,
      errorCategory: null,
      errorSummary: null,
      logObjectKey: null,
    };
    const run = MetadataCrawlerRun.rehydrate({
      id: RUN_ID,
      crawlerId: CRAWLER_ID,
      triggerType: 'MANUAL',
      status: 'QUEUED',
      deduplicationKey: `manual:${RUN_ID}`,
      queuedAt: NOW,
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: {},
      counters: {
        databaseCount: 0,
        schemaCount: 0,
        relationCount: 0,
        columnCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        deletedCount: 0,
        warningCount: 0,
      },
    });
    const findUnique = jest.fn().mockResolvedValue(record);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      transaction: jest.fn(async (work: (tx: never) => Promise<unknown>) =>
        work({
          metadataCrawlerRun: { findUnique, updateMany },
        } as never),
      ),
    } as unknown as PrismaService;
    const mapper = {
      toDomainRun: jest.fn(() => run),
      toRunPersistence: jest.fn(() => ({ status: 'RUNNING' })),
    } as unknown as MetadataCrawlerMapper;
    const queue = new PrismaMetadataCrawlerRunQueue(prisma, mapper, { next: () => RUN_ID });

    await expect(
      queue.claimById(RUN_ID, 'worker-1', new Date('2026-08-18T02:00:00.000Z'), NOW),
    ).resolves.toBe(run);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RUN_ID, status: 'QUEUED' },
        data: { status: 'RUNNING' },
      }),
    );
  });

  it('does not claim a run that is already running', async () => {
    const findUnique = jest.fn().mockResolvedValue({ status: 'RUNNING' });
    const updateMany = jest.fn();
    const prisma = {
      transaction: jest.fn(async (work: (tx: never) => Promise<unknown>) =>
        work({
          metadataCrawlerRun: { findUnique, updateMany },
        } as never),
      ),
    } as unknown as PrismaService;
    const mapper = { toDomainRun: jest.fn() } as unknown as MetadataCrawlerMapper;
    const queue = new PrismaMetadataCrawlerRunQueue(prisma, mapper, { next: () => RUN_ID });

    await expect(
      queue.claimById(RUN_ID, 'worker-1', new Date('2026-08-18T02:00:00.000Z'), NOW),
    ).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

function queuedRun(id: string) {
  return {
    id,
    crawlerId: CRAWLER_ID,
    triggerType: 'MANUAL',
    status: 'QUEUED',
    deduplicationKey: `manual:${id}`,
    scheduledFor: null,
    queuedAt: NOW,
    claimedAt: null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    workerId: null,
    attempt: 0,
    crawlerRevision: 1,
    connectorTypeSnapshot: 'POSTGRESQL',
    safeConfigSnapshot: { includeSchemas: ['public'] },
    ...emptyCounters(),
    errorCategory: null,
    errorSummary: null,
    logObjectKey: null,
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
