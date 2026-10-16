import type { DomainEvent } from '@domain/shared/domain-event';

/**
 * Names of the domain events emitted by the SqlExecution aggregate.
 */
export enum SqlExecutionEventName {
  QuerySubmitted = 'SqlQuerySubmitted',
}

/**
 * Base domain event for the SqlExecution aggregate, discriminated by
 * {@link SqlExecutionEventName}. Variants that carry data extend it.
 */
export class SqlExecutionEvent implements DomainEvent {
  public constructor(
    public readonly eventId: string,
    public readonly eventName: SqlExecutionEventName,
    public readonly aggregateId: string,
    public readonly occurredAt: Date,
  ) {}
}

/**
 * Emitted when a read-only statement is accepted and queued. Only sanitized,
 * non-sensitive fields are carried (a short statement preview, never the full
 * SQL and never any secret).
 */
export class SqlQuerySubmittedEvent extends SqlExecutionEvent {
  public constructor(
    eventId: string,
    aggregateId: string,
    occurredAt: Date,
    public readonly catalog: string,
    public readonly namespace: string | undefined,
    public readonly statementPreview: string,
  ) {
    super(eventId, SqlExecutionEventName.QuerySubmitted, aggregateId, occurredAt);
  }
}
