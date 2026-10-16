import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Producer } from 'kafkajs';

import type { IIntegrationEventPublisher } from '@application/shared/interfaces/i-integration-event-publisher';
import type { OutboxMessage } from '@application/shared/outbox-message';
import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';

@Injectable()
export class RedpandaIntegrationEventPublisher
  implements IIntegrationEventPublisher, OnApplicationShutdown
{
  private readonly producer: Producer;
  private readonly topic: string;
  private connected = false;

  public constructor(config: ConfigService) {
    this.topic = config.getOrThrow<string>('REDPANDA_CONTROL_TOPIC');
    this.producer = new Kafka({
      clientId: 'celesnity-core-outbox',
      brokers: config
        .getOrThrow<string>('REDPANDA_BROKERS')
        .split(',')
        .map((value) => value.trim()),
      ssl: redpandaTlsConfiguration(config),
      sasl: {
        mechanism: 'scram-sha-256',
        username: config.getOrThrow<string>('REDPANDA_USERNAME'),
        password: config.getOrThrow<string>('REDPANDA_PASSWORD'),
      },
      logLevel: logLevel.NOTHING,
    }).producer({ idempotent: true, allowAutoTopicCreation: false, maxInFlightRequests: 5 });
  }

  public async publish(message: OutboxMessage): Promise<void> {
    if (message.organizationId === undefined) {
      throw new Error('Outbox message organization identity is required');
    }
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
    await this.producer.send({
      topic: this.topic,
      acks: -1,
      messages: [
        {
          key: message.aggregateId,
          headers: {
            eventName: message.eventName,
            aggregateType: message.aggregateType,
            organizationId: message.organizationId,
          },
          value: JSON.stringify({
            eventId: message.id,
            organizationId: message.organizationId,
            eventName: message.eventName,
            aggregateType: message.aggregateType,
            aggregateId: message.aggregateId,
            occurredAt: message.occurredAt.toISOString(),
            payload: message.payload,
          }),
        },
      ],
    });
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.connected) await this.producer.disconnect();
  }
}
