import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Consumer } from 'kafkajs';

import { redpandaTlsConfiguration } from '@infrastructure/messaging/redpanda-tls';

import { AutomationWorkflowUseCases } from '@application/automation-workflow/automation-workflow.use-cases';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { parseAutomationWorkflowEventEnvelope } from '@infrastructure/messaging/automation-workflow/automation-workflow-event.validator';

export type AutomationWorkflowConsumerResult = 'DISPATCHED' | 'IGNORED';

/**
 * Event trigger source for automation workflows — the workflow twin of
 * RedpandaAutomationConsumer. Reuses the shared envelope validator and
 * subscribes on its own client/group id so it runs independently of the
 * legacy consumer.
 */
@Injectable()
export class RedpandaAutomationWorkflowConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RedpandaAutomationWorkflowConsumer.name);
  private readonly consumer: Consumer;
  private readonly topics: readonly string[];
  private readonly enabled: boolean;
  private connected = false;

  public constructor(
    private readonly useCases: AutomationWorkflowUseCases,
    private readonly contexts: AuthenticatedContextStore,
    config: ConfigService,
  ) {
    this.enabled =
      config.get<string>('INTEGRATION_EVENT_PUBLISHER_BACKEND', 'logging') === 'redpanda';
    this.topics = config
      .get<string>('AGENT_AUTOMATION_TOPICS', 'celesnity.streaming.control.v1')
      .split(',')
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0);
    const brokers = config
      .get<string>('REDPANDA_BROKERS', 'localhost:19092')
      .split(',')
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0);
    this.consumer = new Kafka({
      clientId: 'celesnity-core-automation-workflow',
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
        'AGENT_AUTOMATION_WORKFLOW_CONSUMER_GROUP_ID',
        'celesnity.automation-workflow.v1',
      ),
      allowAutoTopicCreation: false,
    });
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'Automation workflow event consumer disabled because the logging publisher is active',
      );
      return;
    }
    await this.consumer.connect();
    this.connected = true;
    await this.consumer.subscribe({ topics: [...this.topics], fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        await this.handleMessage(topic, message.value);
      },
    });
    this.logger.log(`Automation workflow event consumer subscribed to ${this.topics.join(', ')}`);
  }

  public async onApplicationShutdown(): Promise<void> {
    if (!this.connected) return;
    await this.consumer.disconnect();
    this.connected = false;
  }

  public async handleMessage(
    topic: string,
    value: Buffer | string | null,
  ): Promise<AutomationWorkflowConsumerResult> {
    const envelope = parseAutomationWorkflowEventEnvelope(value);
    if (envelope === undefined) {
      this.logger.warn(`Ignoring malformed automation workflow event on topic ${topic}`);
      return 'IGNORED';
    }
    await this.contexts.runBackground(
      envelope.organizationId,
      () =>
        this.useCases.dispatchWorkflowsForEvent(envelope.organizationId, topic, envelope.payload),
      'AUTOMATIONS',
    );
    return 'DISPATCHED';
  }
}
