import type { OutboxMessage } from '@application/shared/outbox-message';

/** A staged message together with the delivery history the relay needs. */
export interface PendingOutboxMessage extends OutboxMessage {
  readonly organizationId: string;
  /** How many delivery attempts have already been made and failed. */
  readonly attempts: number;
}

/** The outcome the relay records for a message it could not deliver. */
export interface OutboxDeliveryFailure {
  readonly id: string;
  /** Attempt count including the one that just failed. */
  readonly attempts: number;
  readonly error: string;
  /** When the message becomes eligible again. Ignored when `exhausted`. */
  readonly retryAt: Date;
  /** True once the attempt budget is spent, which parks the message as FAILED. */
  readonly exhausted: boolean;
}

/**
 * Outbound port for the staged-message store the relay drains.
 *
 * Deliberately separate from the write path. Use cases stage messages through
 * {@link IUnitOfWork}; only the relay claims, completes, or reschedules them.
 * Keeping the two apart means a use case has no vocabulary for marking something
 * published.
 */
export interface IOutboxStore {
  /**
   * Claims up to `limit` messages that are due at `now`, moving them to
   * PROCESSING in the same statement so two relay instances cannot claim the
   * same row. Returns them in the order they occurred.
   */
  claimDue(limit: number, now: Date): Promise<readonly PendingOutboxMessage[]>;

  /** Marks delivery complete. */
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;

  /**
   * Records failed attempts: back to PENDING with a later `retryAt`, or parked as
   * FAILED once `exhausted`.
   */
  recordFailures(failures: readonly OutboxDeliveryFailure[]): Promise<void>;

  /**
   * Returns messages stuck in PROCESSING to PENDING. A relay that dies mid-batch
   * leaves rows claimed but undelivered; without this they would never be
   * retried. Returns how many were released.
   */
  releaseStaleClaims(claimedBefore: Date): Promise<number>;

  /**
   * Deletes PUBLISHED messages older than `cutoff` and returns how many were
   * removed. Without retention the table only ever grows.
   */
  purgePublishedBefore(cutoff: Date): Promise<number>;
}
