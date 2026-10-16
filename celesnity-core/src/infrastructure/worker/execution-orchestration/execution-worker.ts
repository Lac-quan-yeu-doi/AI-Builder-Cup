import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { ExecutionWorkerService } from '@application/execution-orchestration/execution-worker.service';
import { secretRedactor } from '@application/shared/secret-redactor';

/**
 * Drives the durable claim loop. It runs only inside the worker process; the API process
 * never instantiates it, so the API never invokes Docker or Spark. On bootstrap it begins
 * polling; on shutdown it stops polling and waits for in-flight executions to settle.
 */
export class ExecutionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExecutionWorker.name);
  private readonly inFlight = new Map<string, Promise<void>>();
  private running = false;
  private ticking = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly service: ExecutionWorkerService,
    private readonly batchSize: number,
    private readonly pollIntervalMs: number,
  ) {}

  public onApplicationBootstrap(): void {
    this.running = true;
    this.scheduleNext(0);
    this.logger.log('Execution worker claim loop started');
  }

  public async onApplicationShutdown(): Promise<void> {
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await Promise.allSettled([...this.inFlight.values()]);
    this.logger.log('Execution worker claim loop stopped');
  }

  private scheduleNext(delayMs: number): void {
    // The claim loop is the worker's primary work; keep the timer referenced so it
    // continues firing until the process is shut down. onApplicationShutdown clears it.
    this.timer = setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      await this.tick();
    } catch (error: unknown) {
      this.logger.error(`Claim loop iteration failed: ${secretRedactor.safeErrorMessage(error)}`);
    } finally {
      if (this.running) {
        this.scheduleNext(this.pollIntervalMs);
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.service.reapCancellations([...this.inFlight.keys()]);

      const capacity = this.batchSize - this.inFlight.size;
      if (capacity <= 0) {
        return;
      }

      const claimed = await this.service.claim(capacity);
      for (const execution of claimed) {
        const task = this.service
          .process(execution)
          .catch((error: unknown) => {
            this.logger.error(
              `Execution ${execution.id} processing failed: ${secretRedactor.safeErrorMessage(error)}`,
            );
          })
          .finally(() => {
            this.inFlight.delete(execution.id);
          });
        this.inFlight.set(execution.id, task);
      }
    } finally {
      this.ticking = false;
    }
  }
}
