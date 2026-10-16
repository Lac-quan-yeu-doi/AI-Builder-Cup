import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { WatchSourcePollingWorkerService } from '@application/data-workflow-watch-source/watch-source-polling-worker.service';
import { secretRedactor } from '@application/shared/secret-redactor';

export class WatchSourcePollingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WatchSourcePollingWorker.name);
  private running = false;
  private ticking = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly service: WatchSourcePollingWorkerService,
    private readonly config: { readonly pollIntervalMs: number },
  ) {}

  public onApplicationBootstrap(): void {
    this.running = true;
    this.schedule(0);
  }

  public onApplicationShutdown(): void {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  public async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const result = await this.service.dispatchOnce();
      return result.captured;
    } finally {
      this.ticking = false;
    }
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => void this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      await this.tick();
    } catch (error: unknown) {
      this.logger.error(
        `Watch Source polling loop failed: ${secretRedactor.safeErrorMessage(error)}`,
      );
    } finally {
      if (this.running) this.schedule(this.config.pollIntervalMs);
    }
  }
}
