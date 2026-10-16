import type { OutboxMessage } from '@application/shared/outbox-message';
import type { DomainEvent } from '@domain/shared/domain-event';
import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';

/**
 * Translates a Connection Registry domain event into an outbox message.
 *
 * The payload carries the connection id and nothing else. That is a security
 * decision, not an oversight: a data connection's interesting fields are its
 * endpoint and credential, and an integration message is the least controlled
 * place either could end up. A consumer that needs details reads them back
 * through the API, where the read model already excludes the credential.
 */
export function toConnectionOutboxMessage(event: DomainEvent): OutboxMessage {
  return {
    id: event.eventId,
    aggregateType: OutboxAggregateType.DataConnection,
    aggregateId: event.aggregateId,
    eventName: event.eventName,
    payload: { connectionId: event.aggregateId },
    occurredAt: event.occurredAt,
  };
}
