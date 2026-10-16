import { ConfigService } from '@nestjs/config';

import type { MetadataCrawlerWorkerService } from '@application/metadata-crawler/metadata-crawler-worker.service';
import { RedpandaMetadataCrawlerConsumer } from '@infrastructure/messaging/metadata-crawler/redpanda-metadata-crawler.consumer';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

const RUN_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const ORGANIZATION_ID = '55555555-5555-4555-8555-555555555555';
const contexts = {
  runBackground: (_organizationId: string, work: () => unknown) => work(),
} as unknown as AuthenticatedContextStore;

function validMessage(runId = RUN_ID): Buffer {
  return Buffer.from(
    JSON.stringify({
      eventId: EVENT_ID,
      organizationId: ORGANIZATION_ID,
      eventName: 'metadata-crawler.run.queued.v1',
      aggregateType: 'MetadataCrawlerRun',
      aggregateId: runId,
      occurredAt: '2026-08-18T01:00:00.000Z',
      payload: { schemaVersion: 1, runId },
    }),
  );
}

function config(): ConfigService {
  return new ConfigService({
    REDPANDA_BROKERS: 'localhost:19092',
    REDPANDA_USERNAME: 'celesnity-admin',
    REDPANDA_PASSWORD: 'celesnity_redpanda_password',
    REDPANDA_TLS_ENABLED: false,
    REDPANDA_CONTROL_TOPIC: 'celesnity.streaming.control.v1',
    METADATA_CRAWLER_CONSUMER_GROUP_ID: 'celesnity.metadata-crawler-worker.v1',
    INTEGRATION_EVENT_PUBLISHER_BACKEND: 'redpanda',
  });
}

describe('RedpandaMetadataCrawlerConsumer', () => {
  it('dispatches a valid queued-run event by its run ID', async () => {
    const worker = {
      dispatch: jest.fn(async () => 'CLAIMED' as const),
    } as unknown as MetadataCrawlerWorkerService;
    const consumer = new RedpandaMetadataCrawlerConsumer(worker, contexts, config());

    await expect(consumer.handleMessage(validMessage())).resolves.toBe('CLAIMED');
    expect(worker.dispatch).toHaveBeenCalledWith(RUN_ID);
  });

  it('acknowledges malformed events without dispatching a crawl', async () => {
    const worker = {
      dispatch: jest.fn(),
    } as unknown as MetadataCrawlerWorkerService;
    const consumer = new RedpandaMetadataCrawlerConsumer(worker, contexts, config());

    await expect(
      consumer.handleMessage(Buffer.from(JSON.stringify({ eventName: 'other.event' }))),
    ).resolves.toBe('IGNORED');
    expect(worker.dispatch).not.toHaveBeenCalled();
  });

  it('leaves transient dispatch errors to KafkaJS retry handling', async () => {
    const worker = {
      dispatch: jest.fn(async () => {
        throw new Error('database temporarily unavailable');
      }),
    } as unknown as MetadataCrawlerWorkerService;
    const consumer = new RedpandaMetadataCrawlerConsumer(worker, contexts, config());

    await expect(consumer.handleMessage(validMessage())).rejects.toThrow(
      'database temporarily unavailable',
    );
  });
});
