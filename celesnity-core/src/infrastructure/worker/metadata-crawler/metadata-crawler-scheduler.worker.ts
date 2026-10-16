import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { MetadataCrawlerSchedulerService } from '@application/metadata-crawler/metadata-crawler-scheduler.service';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface MetadataCrawlerSchedulerWorkerConfig {
  readonly pollIntervalMs: number;
}

export class MetadataCrawlerSchedulerWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MetadataCrawlerSchedulerWorker.name);
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly scheduler: MetadataCrawlerSchedulerService,
    private readonly config: MetadataCrawlerSchedulerWorkerConfig,
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

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      await this.scheduler.tick();
    } catch (error) {
      this.logger.error(
        `Metadata crawler scheduling failed: ${secretRedactor.safeErrorMessage(error)}`,
      );
    } finally {
      if (this.running) this.scheduleNext(this.config.pollIntervalMs);
    }
  }
}
