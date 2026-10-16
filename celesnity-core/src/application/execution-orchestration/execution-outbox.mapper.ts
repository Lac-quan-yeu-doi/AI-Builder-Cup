import type { OutboxMessage } from '@application/shared/outbox-message';
import type { DomainEvent } from '@domain/shared/domain-event';
import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';
import {
  ExecutionFailedEvent,
  ExecutionRequestedEvent,
  ExecutionSucceededEvent,
} from '@domain/execution-orchestration/events/execution.events';

export function toExecutionOutboxMessage(event: DomainEvent): OutboxMessage {
  return {
    id: event.eventId,
    aggregateType: OutboxAggregateType.Execution,
    aggregateId: event.aggregateId,
    eventName: event.eventName,
    payload: payloadFor(event),
    occurredAt: event.occurredAt,
  };
}

function payloadFor(event: DomainEvent): Readonly<Record<string, unknown>> {
  if (event instanceof ExecutionRequestedEvent) {
    return {
      executionId: event.aggregateId,
      workload: event.workload,
      connectionId: event.connectionId,
    };
  }
  if (event instanceof ExecutionSucceededEvent) {
    return {
      executionId: event.aggregateId,
      exitCode: event.exitCode,
      sparkApplicationId: event.sparkApplicationId ?? null,
    };
  }
  if (event instanceof ExecutionFailedEvent) {
    return {
      executionId: event.aggregateId,
      summary: event.summary,
      exitCode: event.exitCode ?? null,
    };
  }
  return { executionId: event.aggregateId };
}
