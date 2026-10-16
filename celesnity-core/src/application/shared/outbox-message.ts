/**
 * One integration message staged for publication.
 *
 * `id` is the domain event's own identifier, not a fresh one. That makes the
 * message naturally idempotent: replaying the same event cannot insert a second
 * row, because the outbox primary key rejects it.
 */
export interface OutboxMessage {
  /** Filled by the tenant-scoped outbox row before any background delivery. */
  readonly organizationId?: string;
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventName: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Date;
}
