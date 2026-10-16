import { MetadataCrawlerWorkerService } from '@application/metadata-crawler/metadata-crawler-worker.service';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { IMetadataCrawlerRunRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-repository';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type {
  IMetadataCrawlerLogStore,
  MetadataCrawlerLogWriter,
} from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { IMetadataCatalogWriter } from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';
import type { DatabaseMetadataCrawler } from '@application/metadata-crawler/database-metadata-crawler';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';
import { MetadataCrawler } from '@domain/metadata-crawler/aggregates/metadata-crawler';
import { MetadataCrawlerRunStatus } from '@domain/metadata-crawler/value-objects/metadata-crawler-values';

const NOW = new Date('2026-08-18T01:00:00.000Z');
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

function queuedRun(): MetadataCrawlerRun {
  return MetadataCrawlerRun.queue({
    id: RUN_ID,
    crawlerId: CRAWLER_ID,
    triggerType: 'MANUAL',
    deduplicationKey: `manual:${RUN_ID}`,
    queuedAt: NOW,
    crawlerRevision: 1,
    connectorTypeSnapshot: 'POSTGRESQL',
    safeConfigSnapshot: {},
  });
}

describe('MetadataCrawlerWorkerService', () => {
  it('claims within capacity and finalizes the run from crawler output', async () => {
    const run = queuedRun();
    const queue: IMetadataCrawlerRunQueue = {
      enqueueManual: jest.fn(),
      claim: jest.fn(async () => [run]),
      claimById: jest.fn(async (_runId, workerId, leaseUntil, now) => {
        run.start({ workerId, leaseExpiresAt: leaseUntil }, now);
        return run;
      }),
      findStatus: jest.fn(),
      heartbeat: jest.fn(async () => true),
      requeueExpired: jest.fn(async () => ({ requeued: [], failed: 0 })),
    };
    const runRepository: IMetadataCrawlerRunRepository = { update: jest.fn(async () => true) };
    const crawlerRepository: IMetadataCrawlerRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findByDatabaseServiceId: jest.fn(),
      findById: jest.fn(async () =>
        MetadataCrawler.create({
          id: CRAWLER_ID,
          databaseServiceId: SERVICE_ID,
          name: 'Crawler',
          scheduleCron: '0 1 * * *',
          scheduleTimezone: 'UTC',
          nextRunAt: new Date('2026-08-19T01:00:00.000Z'),
          discoveryConfig: {},
          now: NOW,
        }),
      ),
    };
    const source = {
      listNamespaces: async function* () {},
      listRelations: async function* () {},
      describeRelation: jest.fn(),
      close: jest.fn(async () => undefined),
    };
    const writer: IMetadataCatalogWriter = {
      beginScope: jest.fn(),
      upsertRelationGraph: jest.fn(),
      completeScope: jest.fn(),
      failScope: jest.fn(),
    };
    const logWriter: MetadataCrawlerLogWriter = {
      append: jest.fn(),
      flush: jest.fn(async () => undefined),
      finalize: jest.fn(async () => 0),
    };
    const logStore: IMetadataCrawlerLogStore = {
      openWriter: jest.fn(() => logWriter),
      read: jest.fn(),
    };
    const service = new MetadataCrawlerWorkerService(
      queue,
      runRepository,
      crawlerRepository,
      {
        requireVerified: jest.fn(async () => ({}) as never),
      },
      {
        require: jest.fn(() => ({ create: jest.fn(async () => source) })),
      } as unknown as IDatabaseMetadataSourceRegistry,
      {
        activeRunsObserved: jest.fn(),
        runFinished: jest.fn(),
        scopeFailed: jest.fn(),
        leaseRecovered: jest.fn(),
      },
      logStore,
      writer,
      {
        run: jest.fn(async () => ({
          status: 'SUCCEEDED',
          discovery: { databaseCount: 1, schemaCount: 2, relationCount: 3, columnCount: 9 },
          changes: { created: 2, updated: 1, unchanged: 0, deleted: 1 },
          failedScopes: 0,
          successfulScopes: 2,
        })),
      } as unknown as DatabaseMetadataCrawler,
      { now: () => NOW },
      { next: () => 'worker-1' },
      { claimBatchSize: 2, leaseMs: 60_000, heartbeatMs: 15_000 },
    );

    await expect(service.dispatch(RUN_ID)).resolves.toBe('CLAIMED');

    expect(queue.claimById).toHaveBeenCalledWith(RUN_ID, 'worker-1', expect.any(Date), NOW);
    expect(runRepository.update).toHaveBeenCalledWith(run, MetadataCrawlerRunStatus.RUNNING);
    expect(run.counters).toEqual({
      databaseCount: 1,
      schemaCount: 2,
      relationCount: 3,
      columnCount: 9,
      createdCount: 2,
      updatedCount: 1,
      unchangedCount: 0,
      deletedCount: 1,
      warningCount: 0,
    });
    expect(logWriter.finalize).toHaveBeenCalledTimes(1);
  });
});
