import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import { MetadataCrawlerRecoveryWorker } from '@infrastructure/worker/metadata-crawler/metadata-crawler-recovery.worker';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';

const NOW = new Date('2026-08-18T02:00:00.000Z');
const RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('MetadataCrawlerRecoveryWorker', () => {
  it('records a replacement queued event for each requeued lease', async () => {
    const requeuedRun = { id: RUN_ID } as MetadataCrawlerRun;
    const queue: IMetadataCrawlerRunQueue = {
      enqueueManual: jest.fn(),
      claim: jest.fn(),
      claimById: jest.fn(),
      findStatus: jest.fn(),
      heartbeat: jest.fn(),
      requeueExpired: jest.fn(async () => ({ requeued: [requeuedRun], failed: 0 })),
    };
    const recordedEvents: OutboxMessage[] = [];
    const unitOfWork: IUnitOfWork = {
      commit: jest.fn(async <T>(work: (events: RecordedEvents) => Promise<T>) =>
        work({ record: (...messages) => recordedEvents.push(...messages) }),
      ),
    };
    const clock: IClock = { now: () => NOW };
    const ids: IIdGenerator = { next: () => '44444444-4444-4444-8444-444444444444' };
    const worker = new MetadataCrawlerRecoveryWorker(queue, unitOfWork, clock, ids, {
      maxAttempts: 3,
      intervalMs: 60_000,
    });

    await expect(worker.tick()).resolves.toBe(1);
    expect(recordedEvents).toEqual([
      expect.objectContaining({
        aggregateId: RUN_ID,
        eventName: 'metadata-crawler.run.queued.v1',
        payload: { schemaVersion: 1, runId: RUN_ID },
      }),
    ]);
  });
});
