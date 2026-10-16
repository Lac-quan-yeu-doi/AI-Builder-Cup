import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Consumer } from 'kafkajs';

import {
  MetadataCrawlerWorkerService,
  type MetadataCrawlerDispatchOutcome,
} from '@application/metadata-crawler/metadata-crawler-worker.service';
import { parseMetadataCrawlerRunQueuedEvent } from '@infrastructure/messaging/metadata-crawler/metadata-crawler-run-event.validator';
import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

export type MetadataCrawlerConsumerResult = MetadataCrawlerDispatchOutcome | 'IGNORED';

/** Consumes queued-run events and delegates durable claiming to the worker service. */
@Injectable()
export class RedpandaMetadataCrawlerConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RedpandaMetadataCrawlerConsumer.name);
  private readonly consumer: Consumer;
  private readonly topic: string;
  private readonly enabled: boolean;
  private connected = false;

  public constructor(
    private readonly worker: MetadataCrawlerWorkerService,
    private readonly contexts: AuthenticatedContextStore,
    config: ConfigService,
  ) {
    this.enabled =
      config.get<string>('INTEGRATION_EVENT_PUBLISHER_BACKEND', 'logging') === 'redpanda';
    this.topic = config.get<string>('REDPANDA_CONTROL_TOPIC', 'celesnity.streaming.control.v1');
    const brokers = config
      .get<string>('REDPANDA_BROKERS', 'localhost:19092')
      .split(',')
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0);
    this.consumer = new Kafka({
      clientId: 'celesnity-core-metadata-crawler',
      brokers,
      ssl: redpandaTlsConfiguration(config),
      sasl: {
        mechanism: 'scram-sha-256',
        username: config.get<string>('REDPANDA_USERNAME', 'celesnity-admin'),
        password: config.get<string>('REDPANDA_PASSWORD', 'celesnity_redpanda_password'),
      },
      logLevel: logLevel.NOTHING,
    }).consumer({
      groupId: config.get<string>(
        'METADATA_CRAWLER_CONSUMER_GROUP_ID',
        'celesnity.metadata-crawler-worker.v1',
      ),
      allowAutoTopicCreation: false,
    });
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'Metadata crawler event consumer disabled because the logging publisher is active',
      );
      return;
    }
    await this.consumer.connect();
    this.connected = true;
    // A fresh consumer group must replay durable queued-run events that may have
    // been published while the worker was unavailable. Dispatch is idempotent:
    // claimById only transitions QUEUED runs, so historical terminal events are
    // acknowledged without executing the crawl again.
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        await this.handleMessage(message.value);
      },
    });
    this.logger.log(`Metadata crawler event consumer subscribed to ${this.topic}`);
  }

  public async onApplicationShutdown(): Promise<void> {
    if (!this.connected) return;
    await this.consumer.disconnect();
    this.connected = false;
  }

  /** Resolves for acknowledged messages; rejects only transient dispatch failures. */
  public async handleMessage(
    value: Buffer | string | null,
  ): Promise<MetadataCrawlerConsumerResult> {
    const event = parseMetadataCrawlerRunQueuedEvent(value);
    if (event === undefined) {
      this.logger.warn('Ignored invalid metadata crawler queued-run event');
      return 'IGNORED';
    }

    const outcome = await this.contexts.runBackground(
      event.organizationId,
      () => this.worker.dispatch(event.payload.runId),
      'CRAWLER',
    );
    if (outcome === 'NOT_FOUND') {
      this.logger.warn(`Ignored metadata crawler event for missing run ${event.payload.runId}`);
    }
    return outcome;
  }
}
