import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { DataWorkflowWorkerService } from '@application/data-workflow/data-workflow-worker.service';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface DataWorkflowWorkerLoopConfig {
  readonly pollIntervalMs: number;
}

/** Lifecycle wrapper that bounds polling and lets the claim store persist the next due time. */
export class DataWorkflowWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DataWorkflowWorker.name);
  private running = false;
  private ticking = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly service: DataWorkflowWorkerService,
    private readonly config: DataWorkflowWorkerLoopConfig,
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
      return await this.service.tick();
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
        `Data workflow claim loop failed: ${secretRedactor.safeErrorMessage(error)}`,
      );
    } finally {
      if (this.running) this.schedule(this.config.pollIntervalMs);
    }
  }
}
