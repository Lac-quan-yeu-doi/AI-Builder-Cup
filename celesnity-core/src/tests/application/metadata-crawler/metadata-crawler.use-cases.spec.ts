import {
  DEFAULT_DATABASE_DISCOVERY_CONFIG,
  MetadataCrawlerUseCases,
} from '@application/metadata-crawler/metadata-crawler.use-cases';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { IMetadataCrawlerSchedule } from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type { IMetadataCrawlerLogStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { DatabaseServiceView } from '@application/database-service/read-models/database-service.view';
import type { MetadataCrawlerView } from '@application/metadata-crawler/read-models/metadata-crawler.view';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import {
  MetadataCrawlerError,
  MetadataCrawlerErrorCode,
} from '@domain/metadata-crawler/errors/metadata-crawler.errors';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

const databaseService: DatabaseServiceView = {
  id: DATABASE_SERVICE_ID,
  name: 'Orders database',
  databaseNames: [],
  connectorType: 'POSTGRESQL',
  configSchemaVersion: 1,
  config: { host: 'db.internal' },
  summary: [],
  verificationStatus: VerificationStatusValue.SUCCEEDED,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

const crawlerView: MetadataCrawlerView = {
  id: CRAWLER_ID,
  databaseServiceId: DATABASE_SERVICE_ID,
  name: 'Orders metadata crawler',
  serviceFamily: 'DATABASE',
  enabled: true,
  scheduleCron: '0 1 * * *',
  scheduleTimezone: 'Asia/Ho_Chi_Minh',
  nextRunAt: '2026-08-19T18:00:00.000Z',
  concurrencyPolicy: 'SKIP',
  timeoutSeconds: 3600,
  revision: 1,
  discoveryConfig: DEFAULT_DATABASE_DISCOVERY_CONFIG,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

function dependencies() {
  const repository: IMetadataCrawlerRepository & { stored?: unknown } = {
    create: jest.fn(),
    update: jest.fn(async () => true),
    findById: jest.fn(),
    findByDatabaseServiceId: jest.fn(async () => undefined),
  };
  const reader: IMetadataCrawlerReader = {
    list: jest.fn(async () => [crawlerView]),
    findById: jest.fn(async () => crawlerView),
    listRuns: jest.fn(async () => []),
    findRunById: jest.fn(),
  };
  const queue: IMetadataCrawlerRunQueue & { active?: unknown } = {
    enqueueManual: jest.fn(async () => ({ id: RUN_ID }) as never),
    claim: jest.fn(),
    claimById: jest.fn(),
    findStatus: jest.fn(),
    heartbeat: jest.fn(),
    requeueExpired: jest.fn(),
  };
  const databaseReader: IDatabaseServiceReader = {
    listActive: jest.fn(async () => ({
      items: [databaseService],
      page: 1,
      pageSize: 50,
      total: 1,
    })),
    findActiveById: jest.fn(async () => databaseService),
  };
  const sourceRegistry: IDatabaseMetadataSourceRegistry = {
    require: jest.fn(() => ({
      connectorType: 'POSTGRESQL',
      capabilities: { descriptions: true, materializedViews: true, ddl: true },
      create: jest.fn(),
    })),
    list: jest.fn(() => []),
  };
  const schedule: IMetadataCrawlerSchedule = {
    next: jest.fn(() => new Date('2026-08-19T18:00:00.000Z')),
    compile: jest.fn((input) => ({
      expression: `${Number(input.timeOfDay.slice(3))} ${Number(input.timeOfDay.slice(0, 2))} * * *`,
      timezone: input.timezone,
    })),
    describe: jest.fn((expression, timezone) => ({
      cadence: 'DAILY',
      timeOfDay: '01:00',
      timezone,
      editable: true,
    })),
  };
  const clock: IClock = { now: () => new Date(NOW.getTime()) };
  const ids: IIdGenerator = { next: () => CRAWLER_ID };
  const logStore: IMetadataCrawlerLogStore = {
    read: jest.fn(),
    openWriter: jest.fn(),
  };
  const sourceMetadataReader: ISourceMetadataCatalogReader = {
    summariesByDatabaseServiceIds: jest.fn(async () => new Map()),
    listNamespaces: jest.fn(),
    listRelations: jest.fn(),
    findRelation: jest.fn(),
    listColumns: jest.fn(),
    listConstraints: jest.fn(),
  };
  const recordedEvents: OutboxMessage[] = [];
  const unitOfWork: IUnitOfWork = {
    commit: jest.fn(async <T>(work: (events: RecordedEvents) => Promise<T>) =>
      work({ record: (...messages) => recordedEvents.push(...messages) }),
    ),
  };
  return {
    repository,
    reader,
    queue,
    databaseReader,
    sourceRegistry,
    schedule,
    clock,
    ids,
    logStore,
    sourceMetadataReader,
    unitOfWork,
    recordedEvents,
  };
}

describe('MetadataCrawlerUseCases', () => {
  it('uses active source snapshot counts separately from historical run counters', async () => {
    const deps = dependencies();
    deps.sourceMetadataReader.summariesByDatabaseServiceIds = jest.fn(
      async () =>
        new Map([
          [
            DATABASE_SERVICE_ID,
            {
              hasSnapshot: true,
              databaseCount: 1,
              schemaCount: 3,
              relationCount: 22,
              columnCount: 73,
              constraintCount: 8,
              lastCrawledAt: '2026-08-18T16:56:00.000Z',
            },
          ],
        ]),
    );
    deps.reader.listRuns = jest.fn(async () => [
      { status: 'SUCCEEDED', counters: { columnCount: 0 } } as never,
    ]);
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    const page = await useCases.list();

    expect(page.items[0]?.snapshotSummary).toEqual({
      hasSnapshot: true,
      databaseCount: 1,
      schemaCount: 3,
      relationCount: 22,
      columnCount: 73,
      constraintCount: 8,
      lastCrawledAt: '2026-08-18T16:56:00.000Z',
    });
    expect(deps.sourceMetadataReader.summariesByDatabaseServiceIds).toHaveBeenCalledTimes(1);
    expect(page.items[0]?.lastRun?.counters.columnCount).toBe(0);
  });

  it('assigns one crawler only to an active verified service with a metadata adapter', async () => {
    const deps = dependencies();
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    const view = await useCases.assign({
      databaseServiceId: DATABASE_SERVICE_ID,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'Asia/Ho_Chi_Minh' },
      discovery: DEFAULT_DATABASE_DISCOVERY_CONFIG,
    });

    expect(view.databaseService.id).toBe(DATABASE_SERVICE_ID);
    expect(view.nextRunAt).toBe('2026-08-19T18:00:00.000Z');
    expect(deps.repository.create).toHaveBeenCalledTimes(1);
  });

  it('defaults unsupported materialized views off for a MySQL assignment', async () => {
    const deps = dependencies();
    deps.databaseReader.findActiveById = jest.fn(async () => ({
      ...databaseService,
      connectorType: 'MYSQL',
    }));
    deps.sourceRegistry.require = jest.fn(() => ({
      connectorType: 'MYSQL',
      capabilities: { descriptions: true, materializedViews: false, ddl: true },
      create: jest.fn(),
    }));
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    const view = await useCases.assign({
      databaseServiceId: DATABASE_SERVICE_ID,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'Asia/Ho_Chi_Minh' },
    });

    expect(view.discoveryConfig.includeMaterializedViews).toBe(false);
    expect(deps.repository.create).toHaveBeenCalledTimes(1);
  });

  it('defaults unsupported materialized views off when updating a MySQL crawler', async () => {
    const deps = dependencies();
    const crawler = MetadataCrawler.create({
      id: CRAWLER_ID,
      databaseServiceId: DATABASE_SERVICE_ID,
      name: 'Orders metadata crawler',
      scheduleCron: '0 1 * * *',
      scheduleTimezone: 'Asia/Ho_Chi_Minh',
      nextRunAt: new Date('2026-08-19T18:00:00.000Z'),
      discoveryConfig: DEFAULT_DATABASE_DISCOVERY_CONFIG,
      now: NOW,
    });
    deps.repository.findById = jest.fn(async () => crawler);
    deps.databaseReader.findActiveById = jest.fn(async () => ({
      ...databaseService,
      connectorType: 'MYSQL',
    }));
    deps.sourceRegistry.require = jest.fn(() => ({
      connectorType: 'MYSQL',
      capabilities: { descriptions: true, materializedViews: false, ddl: true },
      create: jest.fn(),
    }));
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    const view = await useCases.update({ id: CRAWLER_ID, discovery: {} });

    expect(view.discoveryConfig.includeMaterializedViews).toBe(false);
    expect(deps.repository.update).toHaveBeenCalledTimes(1);
  });

  it('returns an active-run conflict instead of queueing overlap', async () => {
    const deps = dependencies();
    deps.repository.findById = jest.fn(async () =>
      MetadataCrawler.create({
        id: CRAWLER_ID,
        databaseServiceId: DATABASE_SERVICE_ID,
        name: 'Orders crawler',
        scheduleCron: '0 1 * * *',
        scheduleTimezone: 'UTC',
        nextRunAt: new Date('2026-08-19T01:00:00.000Z'),
        discoveryConfig: DEFAULT_DATABASE_DISCOVERY_CONFIG,
        now: NOW,
      }),
    );
    deps.queue.enqueueManual = jest.fn(async () => {
      throw MetadataCrawlerError.activeRunConflict();
    }) as never;
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    await expect(useCases.runNow(CRAWLER_ID)).rejects.toMatchObject({
      code: MetadataCrawlerErrorCode.ACTIVE_RUN_CONFLICT,
    });
    expect(deps.queue.enqueueManual).toHaveBeenCalledTimes(1);
  });

  it('records a queued-run outbox event in the same unit of work as a manual run', async () => {
    const deps = dependencies();
    deps.repository.findById = jest.fn(async () =>
      MetadataCrawler.create({
        id: CRAWLER_ID,
        databaseServiceId: DATABASE_SERVICE_ID,
        name: 'Orders crawler',
        scheduleCron: '0 1 * * *',
        scheduleTimezone: 'UTC',
        nextRunAt: new Date('2026-08-19T01:00:00.000Z'),
        discoveryConfig: DEFAULT_DATABASE_DISCOVERY_CONFIG,
        now: NOW,
      }),
    );
    deps.queue.enqueueManual = jest.fn(async () =>
      MetadataCrawlerRun.queue({
        id: RUN_ID,
        crawlerId: CRAWLER_ID,
        triggerType: 'MANUAL',
        deduplicationKey: `manual:${RUN_ID}`,
        queuedAt: NOW,
        crawlerRevision: 1,
        connectorTypeSnapshot: 'POSTGRESQL',
        safeConfigSnapshot: DEFAULT_DATABASE_DISCOVERY_CONFIG,
      }),
    );
    const useCases = new MetadataCrawlerUseCases(
      deps.repository,
      deps.reader,
      deps.queue,
      deps.databaseReader,
      deps.sourceRegistry,
      deps.schedule,
      deps.clock,
      deps.ids,
      deps.logStore,
      deps.sourceMetadataReader,
      deps.unitOfWork,
    );

    await useCases.runNow(CRAWLER_ID);

    expect(deps.unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(deps.recordedEvents).toEqual([
      expect.objectContaining({
        aggregateId: RUN_ID,
        eventName: 'metadata-crawler.run.queued.v1',
        payload: { schemaVersion: 1, runId: RUN_ID },
      }),
    ]);
  });
});
