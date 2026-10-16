import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import { toMetadataCrawlerRunQueuedOutboxMessage } from '@application/metadata-crawler/metadata-crawler-run.outbox.mapper';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface MetadataCrawlerRecoveryWorkerConfig {
  readonly maxAttempts: number;
  readonly intervalMs: number;
}

/** Requeues abandoned runs and republishes only the retryable run IDs. */
export class MetadataCrawlerRecoveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MetadataCrawlerRecoveryWorker.name);
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly queue: IMetadataCrawlerRunQueue,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly config: MetadataCrawlerRecoveryWorkerConfig,
  ) {}

  public onApplicationBootstrap(): void {
    this.running = true;
    this.scheduleNext(0);
  }

  public onApplicationShutdown(): void {
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  public tick(): Promise<number> {
    return this.unitOfWork.commit(async (events) => {
      const now = this.clock.now();
      const result = await this.queue.requeueExpired(this.config.maxAttempts, now);
      events.record(
        ...result.requeued.map((run) =>
          toMetadataCrawlerRunQueuedOutboxMessage(run, this.ids.next(), now),
        ),
      );
      return result.requeued.length;
    });
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => void this.runOnce(), delayMs);
  }

  private async runOnce(): Promise<void> {
    if (!this.running) return;
    try {
      const recovered = await this.tick();
      if (recovered > 0) {
        this.logger.log(`Republished ${recovered} metadata crawler recovery event(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Metadata crawler recovery failed: ${secretRedactor.safeErrorMessage(error)}`,
      );
    } finally {
      if (this.running) this.scheduleNext(this.config.intervalMs);
    }
  }
}
