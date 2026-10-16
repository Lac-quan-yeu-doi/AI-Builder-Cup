import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import type { OutboxRelayService } from '@application/shared/outbox-relay.service';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface OutboxRelayWorkerConfig {
  /** Idle delay between drains when there is nothing to deliver. */
  readonly pollIntervalMs: number;
  /** How often to purge delivered messages and release abandoned claims. */
  readonly maintenanceIntervalMs: number;
  /**
   * Consecutive full batches drained before yielding to the timer. Bounds a
   * catch-up burst so a large backlog cannot monopolise the process.
   */
  readonly maxConsecutiveDrains: number;
}

/**
 * Drives the outbox relay.
 *
 * Runs in the worker process only. Putting it in the API process would mean every
 * API replica competing for the same rows — harmless, because claiming is
 * exclusive, but pointless contention, and it would tie delivery latency to
 * request load.
 *
 * The loop drains repeatedly while batches keep coming back full, so a backlog
 * clears at the speed of the consumer rather than one batch per poll interval, and
 * falls back to the timer once the queue is empty. Maintenance runs on a longer
 * cadence because purging and claim recovery are housekeeping, not delivery.
 */
export class OutboxRelayWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayWorker.name);
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> = Promise.resolve();
  private lastMaintenanceAt = 0;

  public constructor(
    private readonly relay: OutboxRelayService,
    private readonly config: OutboxRelayWorkerConfig,
  ) {}

  public onApplicationBootstrap(): void {
    this.running = true;
    this.scheduleNext(0);
    this.logger.log('Outbox relay started');
  }

  public async onApplicationShutdown(): Promise<void> {
    this.running = false;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    // Let the current drain finish so its delivered messages are marked
    // published; abandoning it would republish them on the next start.
    await this.inFlight;
    this.logger.log('Outbox relay stopped');
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }
    try {
      await this.runMaintenanceIfDue();
      await this.drainWhileBusy();
    } catch (error: unknown) {
      this.logger.error(`Outbox relay iteration failed: ${secretRedactor.safeErrorMessage(error)}`);
    } finally {
      if (this.running) {
        this.scheduleNext(this.config.pollIntervalMs);
      }
    }
  }

  private async drainWhileBusy(): Promise<void> {
    for (let drain = 0; drain < this.config.maxConsecutiveDrains; drain += 1) {
      const result = await this.relay.drain();
      // A partial batch means the queue is drained; stop and wait for the timer.
      if (result.claimed === 0 || result.published + result.failed < result.claimed) {
        return;
      }
      if (!this.running) {
        return;
      }
    }
  }

  private async runMaintenanceIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastMaintenanceAt < this.config.maintenanceIntervalMs) {
      return;
    }
    this.lastMaintenanceAt = now;

    await this.relay.recoverStaleClaims();
    const purged = await this.relay.purgeDelivered();
    if (purged > 0) {
      this.logger.log(`Purged ${purged} delivered outbox message(s) past retention`);
    }
  }
}
