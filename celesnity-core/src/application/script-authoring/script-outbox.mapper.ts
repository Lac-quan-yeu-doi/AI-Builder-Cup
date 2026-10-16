import type { OutboxMessage } from '@application/shared/outbox-message';
import type { DomainEvent } from '@domain/shared/domain-event';
import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';
import { ScriptVersionPublishedEvent } from '@domain/script-authoring/events/script.events';

export function toScriptOutboxMessage(event: DomainEvent): OutboxMessage {
  const payload: Readonly<Record<string, unknown>> =
    event instanceof ScriptVersionPublishedEvent
      ? {
          scriptId: event.aggregateId,
          scriptVersionId: event.scriptVersionId,
          versionNumber: event.versionNumber,
        }
      : { scriptId: event.aggregateId };

  return {
    id: event.eventId,
    aggregateType: OutboxAggregateType.Script,
    aggregateId: event.aggregateId,
    eventName: event.eventName,
    payload,
    occurredAt: event.occurredAt,
  };
}
