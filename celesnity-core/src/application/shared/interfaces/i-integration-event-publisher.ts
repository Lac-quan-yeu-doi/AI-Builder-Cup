import type { OutboxMessage } from '@application/shared/outbox-message';

/**
 * Outbound port for delivering a staged message to whatever consumes integration
 * events.
 *
 * Deliberately one message at a time and deliberately allowed to fail: the relay
 * treats a rejection as retryable and reschedules with backoff. Because delivery
 * happens after the producing transaction has committed, the guarantee is
 * at-least-once, so implementations must tolerate a message arriving twice.
 * `OutboxMessage.id` is the domain event id and is stable across retries, which
 * is what a consumer should deduplicate on.
 */
export interface IIntegrationEventPublisher {
  publish(message: OutboxMessage): Promise<void>;
}
