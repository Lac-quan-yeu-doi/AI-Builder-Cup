import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { WorkflowScheduleWorkerService } from '@application/data-workflow/workflow-schedule-worker.service';
import { secretRedactor } from '@application/shared/secret-redactor';

export class WorkflowScheduleWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkflowScheduleWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private ticking = false;
  public constructor(
    private readonly service: WorkflowScheduleWorkerService,
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
      return await this.service.tick();
    } finally {
      this.ticking = false;
    }
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => void this.poll(), delay);
  }
  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(
        `Data workflow schedule loop failed: ${secretRedactor.safeErrorMessage(error)}`,
      );
    } finally {
      if (this.running) this.schedule(this.config.pollIntervalMs);
    }
  }
}
