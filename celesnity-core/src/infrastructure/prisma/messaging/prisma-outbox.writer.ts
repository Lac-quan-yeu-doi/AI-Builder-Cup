import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';
import type { OutboxMessage } from '@application/shared/outbox-message';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Stages integration messages in the outbox table.
 *
 * No longer an application port. Staging is not something a use case asks for
 * directly — it hands messages to the unit of work, which is the only caller
 * here, and which guarantees the insert shares the transaction with the writes
 * that produced the messages. Making this a plain infrastructure collaborator
 * removes a port that had exactly one consumer inside the same layer.
 */
@Injectable()
export class PrismaOutboxWriter {
  public constructor(private readonly prisma: PrismaService) {}

  public async append(messages: readonly OutboxMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const organizationId = this.prisma.organizationId;
    if (
      messages.some(
        (message) => message.organizationId === undefined && organizationId === undefined,
      )
    ) {
      throw new Error('Outbox messages require an explicit organization context');
    }

    // `createMany` is one round trip regardless of batch size, which matters
    // because publishing a script version stages several messages at once.
    await this.prisma.client.outboxEvent.createMany({
      data: messages.map((message) => ({
        id: message.id,
        organizationId: message.organizationId ?? organizationId!,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        eventName: message.eventName,
        payload: toJsonValue(message.payload),
        occurredAt: message.occurredAt,
        availableAt: message.occurredAt,
      })),
    });
  }
}

/**
 * Narrows a payload to what Prisma will accept for a `Json` column.
 *
 * The round trip through `JSON.stringify` is not ceremony: a payload may carry a
 * `Date` or an `undefined` property, and Prisma rejects both. Serializing first
 * turns dates into ISO strings and drops undefined keys, which is exactly the
 * shape that will come back out of the column on read.
 */
function toJsonValue(payload: Readonly<Record<string, unknown>>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}
