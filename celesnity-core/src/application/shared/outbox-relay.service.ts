import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIntegrationEventPublisher } from '@application/shared/interfaces/i-integration-event-publisher';
import type {
  OutboxDeliveryFailure,
  PendingOutboxMessage,
  IOutboxStore,
} from '@application/shared/interfaces/i-outbox-store';
import { secretRedactor } from '@application/shared/secret-redactor';

export interface OutboxRelayConfig {
  /** How many messages one drain claims. */
  readonly batchSize: number;
  /** Delivery attempts before a message is parked as FAILED. */
  readonly maxAttempts: number;
  /** First retry delay; doubles per attempt up to {@link maxBackoffMs}. */
  readonly baseBackoffMs: number;
  readonly maxBackoffMs: number;
  /** How long a PROCESSING claim may sit before it is treated as abandoned. */
  readonly claimTimeoutMs: number;
  /** How long a delivered message is kept before being purged. */
  readonly retentionMs: number;
}

/** Minimal logging seam, so the application layer never imports a framework logger. */
export interface OutboxRelayLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface OutboxDrainResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

/**
 * Delivers staged outbox messages, then records what happened.
 *
 * This is the half of the transactional outbox that was missing. Messages were
 * being staged correctly — every write path appended to `outbox_events` inside its
 * own transaction — but nothing ever read the table. The consequences were not
 * subtle: no integration event was ever delivered, every row sat at PENDING
 * forever, and the table grew without bound because nothing purged it either. The
 * schema had `status`, `attempts`, `available_at`, `published_at` and `last_error`
 * columns, and an index on `[status, available_at]`, all designed for a relay that
 * did not exist.
 *
 * The delivery guarantee is at-least-once, and it cannot be better than that. The
 * message is committed before it is sent, so the send can succeed while the
 * subsequent "mark published" fails, and the message will then be delivered again.
 * Exactly-once would require the send and the mark to share a transaction, which
 * is impossible when the destination is not the database. Consumers therefore have
 * to deduplicate, and {@link PendingOutboxMessage.id} is the stable key for that:
 * it is the domain event's id, unchanged across retries.
 *
 * Failures are per message, not per batch. One undeliverable message reschedules
 * itself and the rest of the batch still completes, because a single bad payload
 * must not block the queue behind it.
 */
export class OutboxRelayService {
  public constructor(
    private readonly store: IOutboxStore,
    private readonly publisher: IIntegrationEventPublisher,
    private readonly clock: IClock,
    private readonly config: OutboxRelayConfig,
    private readonly logger: OutboxRelayLogger,
  ) {}

  /**
   * Claims one batch and attempts to deliver it. Returns what happened, so the
   * caller can drain again immediately while batches keep coming back full.
   */
  public async drain(): Promise<OutboxDrainResult> {
    const claimed = await this.store.claimDue(this.config.batchSize, this.clock.now());
    if (claimed.length === 0) {
      return { claimed: 0, published: 0, failed: 0 };
    }

    const delivered: string[] = [];
    const failures: OutboxDeliveryFailure[] = [];
    for (const message of claimed) {
      const failure = await this.deliver(message);
      if (failure === undefined) {
        delivered.push(message.id);
      } else {
        failures.push(failure);
      }
    }

    if (delivered.length > 0) {
      await this.store.markPublished(delivered, this.clock.now());
    }
    if (failures.length > 0) {
      await this.store.recordFailures(failures);
    }
    return { claimed: claimed.length, published: delivered.length, failed: failures.length };
  }

  /**
   * Returns claims abandoned by a relay that died mid-batch, so they become
   * eligible again. Without this a crash would strand its whole batch in
   * PROCESSING permanently.
   */
  public async recoverStaleClaims(): Promise<number> {
    const claimedBefore = new Date(this.clock.now().getTime() - this.config.claimTimeoutMs);
    const released = await this.store.releaseStaleClaims(claimedBefore);
    if (released > 0) {
      this.logger.warn(`Released ${released} abandoned outbox claim(s) for retry`);
    }
    return released;
  }

  /** Drops delivered messages past their retention window. */
  public async purgeDelivered(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - this.config.retentionMs);
    return this.store.purgePublishedBefore(cutoff);
  }

  private async deliver(message: PendingOutboxMessage): Promise<OutboxDeliveryFailure | undefined> {
    try {
      await this.publisher.publish(message);
      return undefined;
    } catch (error: unknown) {
      const attempts = message.attempts + 1;
      const exhausted = attempts >= this.config.maxAttempts;
      // The payload can carry anything a domain event carried, so the recorded
      // reason is redacted before it is written back to a column that operators read.
      const reason = secretRedactor.safeErrorMessage(error);

      if (exhausted) {
        this.logger.error(
          `Outbox message ${message.id} (${message.eventName}) parked as FAILED after ${attempts} attempt(s): ${reason}`,
        );
      } else {
        this.logger.warn(
          `Outbox message ${message.id} (${message.eventName}) delivery attempt ${attempts} failed: ${reason}`,
        );
      }

      return {
        id: message.id,
        attempts,
        error: reason,
        retryAt: this.nextRetryAt(attempts),
        exhausted,
      };
    }
  }

  /**
   * Exponential backoff, capped. Doubling keeps a persistently broken consumer
   * from being hammered, and the cap keeps a message from being deferred for days
   * once attempts accumulate.
   */
  private nextRetryAt(attempts: number): Date {
    const exponential = this.config.baseBackoffMs * 2 ** (attempts - 1);
    const delay = Math.min(exponential, this.config.maxBackoffMs);
    return new Date(this.clock.now().getTime() + delay);
  }
}
