import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';
import type { OutboxMessage } from '@application/shared/outbox-message';
import type { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';

export function toMetadataCrawlerRunQueuedOutboxMessage(
  run: MetadataCrawlerRun,
  eventId: string,
  occurredAt: Date,
): OutboxMessage {
  return {
    id: eventId,
    ...(run.organizationId === undefined ? {} : { organizationId: run.organizationId }),
    aggregateType: OutboxAggregateType.MetadataCrawlerRun,
    aggregateId: run.id,
    eventName: 'metadata-crawler.run.queued.v1',
    payload: { schemaVersion: 1, runId: run.id },
    occurredAt,
  };
}
