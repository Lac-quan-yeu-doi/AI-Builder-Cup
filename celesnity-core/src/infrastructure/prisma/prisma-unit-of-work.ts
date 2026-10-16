import { Injectable } from '@nestjs/common';

import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';
import { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * Accumulates what a unit of work recorded, so the messages can be staged once
 * at the end rather than one statement at a time as the work proceeds.
 */
class CollectedEvents implements RecordedEvents {
  private readonly messages: OutboxMessage[] = [];

  public record(...messages: readonly OutboxMessage[]): void {
    this.messages.push(...messages);
  }

  public drain(): readonly OutboxMessage[] {
    return this.messages.splice(0, this.messages.length);
  }
}

/**
 * Prisma-backed {@link IUnitOfWork}.
 *
 * The ordering is the whole point: the work runs, then the messages it recorded
 * are staged, then the transaction commits. Because staging happens inside the
 * transaction, there is no window in which a row exists without its message or a
 * message exists without its row — which is the guarantee the outbox pattern is
 * for, and the reason publishing cannot simply happen after the commit.
 */
@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: PrismaOutboxWriter,
  ) {}

  public commit<T>(work: (events: RecordedEvents) => Promise<T>): Promise<T> {
    if (this.prisma.inTransaction) {
      // Joining rather than nesting. Prisma has no savepoints here, so opening a
      // second transaction would give the inner work its own commit boundary and
      // silently break the outer one's atomicity. Enlisting in the transaction
      // already in progress keeps a single commit for the whole call tree.
      return this.runWork(work);
    }
    return this.prisma.transaction(() => this.runWork(work));
  }

  private async runWork<T>(work: (events: RecordedEvents) => Promise<T>): Promise<T> {
    const events = new CollectedEvents();
    const result = await work(events);
    await this.outbox.append(events.drain());
    return result;
  }
}
