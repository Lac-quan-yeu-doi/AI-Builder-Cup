import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IMetadataCrawlerSchedulerStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-scheduler-store';
import { toMetadataCrawlerRunQueuedOutboxMessage } from '@application/metadata-crawler/metadata-crawler-run.outbox.mapper';

export class MetadataCrawlerSchedulerService {
  public constructor(
    private readonly store: IMetadataCrawlerSchedulerStore,
    private readonly clock: IClock,
    private readonly batchSize: number,
    private readonly unitOfWork: IUnitOfWork,
    private readonly ids: IIdGenerator,
  ) {}

  public tick(): Promise<number> {
    return this.unitOfWork.commit(async (events) => {
      const now = this.clock.now();
      const runs = await this.store.scheduleDue(this.batchSize, now);
      events.record(
        ...runs.map((run) => toMetadataCrawlerRunQueuedOutboxMessage(run, this.ids.next(), now)),
      );
      return runs.length;
    });
  }
}
