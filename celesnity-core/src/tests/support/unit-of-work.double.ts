import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { OutboxMessage } from '@application/shared/outbox-message';

/**
 * An in-memory {@link IUnitOfWork} that runs the work immediately and keeps every
 * recorded message.
 *
 * The point is to make staging observable. A use case that forgets to record its
 * domain events still passes any assertion about the row it wrote, which is
 * exactly how the connection registry ended up publishing nothing for five event
 * types. {@link FakeUnitOfWork.recorded} lets a test assert on the messages
 * themselves.
 *
 * Rollback is modelled the only way it can be without a database: when the work
 * throws, the messages it recorded are discarded, mirroring a transaction that
 * never committed.
 */
export class FakeUnitOfWork implements IUnitOfWork {
  public readonly recorded: OutboxMessage[] = [];
  public commits = 0;

  public async commit<T>(work: (events: RecordedEvents) => Promise<T>): Promise<T> {
    this.commits += 1;
    const staged: OutboxMessage[] = [];
    const events: RecordedEvents = {
      record: (...messages: readonly OutboxMessage[]): void => {
        staged.push(...messages);
      },
    };

    const result = await work(events);
    this.recorded.push(...staged);
    return result;
  }

  /** Every event name recorded so far, in order. */
  public get recordedEventNames(): readonly string[] {
    return this.recorded.map((message) => message.eventName);
  }
}
