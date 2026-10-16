import { DEFAULT_DATABASE_DISCOVERY_CONFIG } from '@application/metadata-crawler/metadata-crawler.use-cases';
import { toMetadataCrawlerRunQueuedOutboxMessage } from '@application/metadata-crawler/metadata-crawler-run.outbox.mapper';
import { OutboxAggregateType } from '@application/shared/outbox-aggregate-type';
import { MetadataCrawlerRun } from '@domain/metadata-crawler/aggregates/metadata-crawler-run';

const NOW = new Date('2026-08-19T01:00:00.000Z');
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const CRAWLER_ID = '22222222-2222-4222-8222-222222222222';

describe('toMetadataCrawlerRunQueuedOutboxMessage', () => {
  it('maps a queued run to a secret-free versioned notification', () => {
    const run = MetadataCrawlerRun.queue({
      id: RUN_ID,
      crawlerId: CRAWLER_ID,
      triggerType: 'MANUAL',
      deduplicationKey: `manual:${RUN_ID}`,
      queuedAt: NOW,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      safeConfigSnapshot: DEFAULT_DATABASE_DISCOVERY_CONFIG,
    });

    expect(toMetadataCrawlerRunQueuedOutboxMessage(run, EVENT_ID, NOW)).toEqual({
      id: EVENT_ID,
      aggregateType: OutboxAggregateType.MetadataCrawlerRun,
      aggregateId: RUN_ID,
      eventName: 'metadata-crawler.run.queued.v1',
      payload: { schemaVersion: 1, runId: RUN_ID },
      occurredAt: NOW,
    });
  });
});
