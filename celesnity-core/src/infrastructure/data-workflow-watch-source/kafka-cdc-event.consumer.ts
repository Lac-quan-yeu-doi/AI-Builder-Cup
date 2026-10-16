import { createHash } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Consumer } from 'kafkajs';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { IngestCdcEventUseCase } from '@application/data-workflow-watch-source/ingest-cdc-event.use-case';
import type { CdcMetadataEvent } from '@domain/data-workflow-watch-source/models/cdc-event';
import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';

export type CdcConsumerResult = 'INGESTED' | 'DUPLICATE' | 'IGNORED';

@Injectable()
export class KafkaCdcEventConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaCdcEventConsumer.name);
  private readonly consumer: Consumer;
  private readonly topic: string;
  private readonly enabled: boolean;
  private connected = false;

  public constructor(
    private readonly ingest: IngestCdcEventUseCase,
    private readonly contexts: AuthenticatedContextStore,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('DATA_WORKFLOW_CDC_ENABLED', false);
    this.topic = config.get<string>('DATA_WORKFLOW_CDC_TOPIC', 'celesnity.data-workflow.cdc.v1');
    const brokers = config
      .get<string>('REDPANDA_BROKERS', 'localhost:19092')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
    this.consumer = new Kafka({
      clientId: 'celesnity-core-data-workflow-cdc',
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
        'DATA_WORKFLOW_CDC_CONSUMER_GROUP_ID',
        'celesnity.data-workflow-cdc.v1',
      ),
      allowAutoTopicCreation: false,
    });
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Data Workflow CDC consumer disabled by DATA_WORKFLOW_CDC_ENABLED');
      return;
    }
    await this.consumer.connect();
    this.connected = true;
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await this.handleMessage(topic, partition, message.offset, message.value);
      },
    });
    this.logger.log(`Data Workflow CDC consumer subscribed to ${this.topic}`);
  }

  public async onApplicationShutdown(): Promise<void> {
    if (!this.connected) return;
    await this.consumer.disconnect();
    this.connected = false;
  }

  public async handleMessage(
    topic: string,
    partition: number,
    offset: string,
    value: Buffer | string | null,
  ): Promise<CdcConsumerResult> {
    const event = parseCdcMetadataValue(topic, partition, offset, value);
    if (event === undefined) {
      this.logger.warn('Ignored invalid metadata-only CDC event');
      return 'IGNORED';
    }
    const result = await this.contexts.runBackground(
      event.organizationId,
      () => this.ingest.execute(event),
      'EXECUTIONS',
    );
    return result.duplicate ? 'DUPLICATE' : 'INGESTED';
  }
}

export function parseCdcMetadataValue(
  topic: string,
  partition: number,
  offset: string,
  value: Buffer | string | null,
): CdcMetadataEvent | undefined {
  if (value === null || topic.trim() === '' || !Number.isInteger(partition) || partition < 0)
    return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof value === 'string' ? value : value.toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const metadata = unwrapJsonConverterEnvelope(parsed);
  for (const forbidden of ['before', 'after', 'key', 'payload', 'row', 'data', 'values']) {
    if (forbidden in metadata) return undefined;
  }
  const relation = isRecord(metadata.relation)
    ? metadata.relation
    : { schema: metadata.schema, table: metadata.table };
  const operation = normalizeOperation(metadata.operation);
  const committedAt = parseDate(metadata.committedAt ?? metadata.ts_ms);
  if (
    typeof metadata.connectorId !== 'string' ||
    typeof metadata.organizationId !== 'string' ||
    typeof metadata.databaseServiceId !== 'string' ||
    typeof relation.schema !== 'string' ||
    typeof relation.table !== 'string' ||
    operation === undefined ||
    committedAt === undefined
  ) {
    return undefined;
  }
  return {
    connectorId: metadata.connectorId,
    organizationId: metadata.organizationId,
    databaseServiceId: metadata.databaseServiceId,
    relation: { schema: relation.schema, table: relation.table },
    operation,
    positionFingerprint: `sha256:${createHash('sha256').update(`${topic}\u0000${partition}\u0000${offset}`).digest('hex')}`,
    committedAt,
    topic,
    partition,
    offset,
  };
}

function unwrapJsonConverterEnvelope(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (value.schema === null && isRecord(value.payload)) return value.payload;
  return value;
}

function normalizeOperation(value: unknown): CdcMetadataEvent['operation'] | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value.toUpperCase()) {
    case 'C':
    case 'INSERT':
      return 'INSERT';
    case 'U':
    case 'UPDATE':
      return 'UPDATE';
    case 'D':
    case 'DELETE':
      return 'DELETE';
    default:
      return undefined;
  }
}

function parseDate(value: unknown): Date | undefined {
  const date =
    typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : undefined;
  return date === undefined || Number.isNaN(date.getTime()) ? undefined : date;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
