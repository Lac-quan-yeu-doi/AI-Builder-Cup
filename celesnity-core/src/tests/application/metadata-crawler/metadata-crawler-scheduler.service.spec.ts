import { MetadataCrawlerSchedulerService } from '@application/metadata-crawler/metadata-crawler-scheduler.service';
import type { IMetadataCrawlerSchedulerStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-scheduler-store';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';

const NOW = new Date('2026-08-19T01:00:00.000Z');
const RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('MetadataCrawlerSchedulerService', () => {
  it('records one queued-run event for every scheduled run in the same unit of work', async () => {
    const queuedRun = { id: RUN_ID } as never;
    const store: IMetadataCrawlerSchedulerStore = {
      scheduleDue: jest.fn(async () => [queuedRun] as never),
    };
    const recordedEvents: OutboxMessage[] = [];
    const unitOfWork: IUnitOfWork = {
      commit: jest.fn(async <T>(work: (events: RecordedEvents) => Promise<T>) =>
        work({ record: (...messages) => recordedEvents.push(...messages) }),
      ),
    };
    const clock: IClock = { now: () => NOW };
    const ids: IIdGenerator = { next: () => '44444444-4444-4444-8444-444444444444' };
    const service = new MetadataCrawlerSchedulerService(store, clock, 10, unitOfWork, ids);

    await expect(service.tick()).resolves.toBe(1);

    expect(unitOfWork.commit).toHaveBeenCalledTimes(1);
    expect(recordedEvents).toEqual([
      expect.objectContaining({
        aggregateId: RUN_ID,
        eventName: 'metadata-crawler.run.queued.v1',
        payload: { schemaVersion: 1, runId: RUN_ID },
      }),
    ]);
  });
});
