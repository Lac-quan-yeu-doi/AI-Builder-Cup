import type { OutboxMessage } from '@application/shared/outbox-message';
import type { DomainEvent } from '@domain/shared/domain-event';
import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';
import { SqlQuerySubmittedEvent } from '@domain/query-workbench/events/sql-execution.events';

/**
 * Translates a Query Workbench domain event into an outbox message. Only
 * sanitized, non-sensitive fields are included in the payload (a short
 * statement preview, never the full SQL and never any secret).
 */
export function toSqlExecutionOutboxMessage(event: DomainEvent): OutboxMessage {
  const payload: Readonly<Record<string, unknown>> =
    event instanceof SqlQuerySubmittedEvent
      ? {
          catalog: event.catalog,
          namespace: event.namespace ?? null,
          statementPreview: event.statementPreview,
        }
      : {};

  return {
    id: event.eventId,
    aggregateType: OutboxAggregateType.SqlExecution,
    aggregateId: event.aggregateId,
    eventName: event.eventName,
    payload,
    occurredAt: event.occurredAt,
  };
}
