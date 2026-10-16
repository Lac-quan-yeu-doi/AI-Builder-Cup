import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { AutomationWorkflowSchedulerService } from '@application/automation-workflow/automation-workflow-scheduler.service';

export interface AutomationWorkflowSchedulerWorkerConfig {
  readonly pollIntervalMs: number;
}

/** Background poll loop that ticks the workflow scheduler — mirrors AutomationSchedulerWorker. */
export class AutomationWorkflowSchedulerWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AutomationWorkflowSchedulerWorker.name);
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly scheduler: AutomationWorkflowSchedulerService,
    private readonly config: AutomationWorkflowSchedulerWorkerConfig,
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
        `Automation workflow scheduling failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (this.running) this.scheduleNext(this.config.pollIntervalMs);
    }
  }
}
