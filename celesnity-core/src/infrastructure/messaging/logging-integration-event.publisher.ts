import { Injectable, Logger } from '@nestjs/common';

import type { IIntegrationEventPublisher } from '@application/shared/interfaces/i-integration-event-publisher';
import type { OutboxMessage } from '@application/shared/outbox-message';

/**
 * Delivers integration events to the application log.
 *
 * A deliberate placeholder, and the honest one. This deployment has no message
 * broker, so there is nowhere else for an event to go — but the alternative to a
 * real sink is not "no relay", it is a relay whose destination is swappable. With
 * this in place the staging, claiming, retry, backoff and retention machinery all
 * run and are observable, and introducing a broker later is one binding change in
 * the worker module rather than building the relay from scratch.
 *
 * The payload is logged as JSON rather than interpolated, so a payload field
 * cannot forge log structure. Payloads are already built to exclude secrets — the
 * connection mapper carries only an id, and the SQL mapper only a truncated
 * statement preview — so there is nothing further to redact here.
 */
@Injectable()
export class LoggingIntegrationEventPublisher implements IIntegrationEventPublisher {
  private readonly logger = new Logger('IntegrationEvents');

  public publish(message: OutboxMessage): Promise<void> {
    if (message.organizationId === undefined) {
      return Promise.reject(new Error('Outbox message organization identity is required'));
    }
    this.logger.log(
      JSON.stringify({
        eventId: message.id,
        organizationId: message.organizationId,
        eventName: message.eventName,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        occurredAt: message.occurredAt.toISOString(),
        payload: message.payload,
      }),
    );
    return Promise.resolve();
  }
}
