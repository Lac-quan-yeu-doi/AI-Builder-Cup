import type { Prisma } from '@generated/prisma/client';
import type { OutboxMessage } from '@application/shared/outbox-message';
import type { PrismaOutboxWriter } from '@infrastructure/prisma/messaging/prisma-outbox.writer';
import { PrismaTransactionContext } from '@infrastructure/prisma/prisma-transaction.context';
import { PrismaUnitOfWork } from '@infrastructure/prisma/prisma-unit-of-work';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

/**
 * The unit of work, which is the mechanism the whole refactor rests on. If it gets
 * the ordering or the nesting wrong, the outbox stops being transactional and the
 * guarantee it exists to provide quietly disappears.
 *
 * Four properties are asserted:
 *
 *  - messages are staged *inside* the transaction, before commit;
 *  - a failure stages nothing, so a message cannot exist without its row;
 *  - a nested commit joins the outer transaction rather than opening a second one;
 *  - the transaction is ambient, so a collaborator that never received a scope
 *    still resolves the active client.
 *
 * `PrismaService` is stubbed rather than connected. What is under test is the
 * ordering and nesting logic, not Prisma's own transaction semantics.
 */

/** Records the order of interesting events so ordering can be asserted directly. */
class Journal {
  public readonly entries: string[] = [];

  public record(entry: string): void {
    this.entries.push(entry);
  }
}

/**
 * A stand-in for {@link PrismaService} that mimics the one behaviour that matters:
 * `transaction` binds an ambient client for the duration of the callback, and
 * `client` resolves it.
 */
function stubPrismaService(
  journal: Journal,
  transactions: PrismaTransactionContext,
  options: { readonly failCommit?: boolean } = {},
): PrismaService {
  const fakeClient = { marker: 'tx' } as unknown as Prisma.TransactionClient;

  const service = {
    get client(): Prisma.TransactionClient {
      return transactions.current() ?? ({ marker: 'base' } as unknown as Prisma.TransactionClient);
    },
    get inTransaction(): boolean {
      return transactions.current() !== undefined;
    },
    async transaction<T>(work: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      journal.record('transaction:begin');
      try {
        const result = await transactions.run(fakeClient, () => work(fakeClient));
        if (options.failCommit === true) {
          journal.record('transaction:commit-failed');
          throw new Error('commit failed');
        }
        journal.record('transaction:commit');
        return result;
      } catch (error: unknown) {
        journal.record('transaction:rollback');
        throw error;
      }
    },
  };

  return service as unknown as PrismaService;
}

/** An outbox writer that records what it was asked to stage, and when. */
function stubOutboxWriter(
  journal: Journal,
  staged: OutboxMessage[][],
  prisma: PrismaService,
): PrismaOutboxWriter {
  const writer = {
    append(messages: readonly OutboxMessage[]): Promise<void> {
      journal.record(`outbox:append(${messages.length})`);
      // Proves the staging insert sees the transaction, not the base client.
      journal.record(`outbox:client=${(prisma.client as unknown as { marker: string }).marker}`);
      staged.push([...messages]);
      return Promise.resolve();
    },
  };
  return writer as unknown as PrismaOutboxWriter;
}

function message(id: string): OutboxMessage {
  return {
    id,
    aggregateType: 'Script',
    aggregateId: '99999999-9999-4999-8999-999999999999',
    eventName: 'ScriptCreated',
    payload: {},
    occurredAt: new Date('2026-08-04T10:00:00.000Z'),
  };
}

interface Harness {
  readonly unitOfWork: PrismaUnitOfWork;
  readonly journal: Journal;
  readonly staged: OutboxMessage[][];
  readonly transactions: PrismaTransactionContext;
  readonly prisma: PrismaService;
}

function harness(options: { readonly failCommit?: boolean } = {}): Harness {
  const journal = new Journal();
  const staged: OutboxMessage[][] = [];
  const transactions = new PrismaTransactionContext();
  const prisma = stubPrismaService(journal, transactions, options);
  const writer = stubOutboxWriter(journal, staged, prisma);
  return {
    unitOfWork: new PrismaUnitOfWork(prisma, writer),
    journal,
    staged,
    transactions,
    prisma,
  };
}

describe('PrismaUnitOfWork.commit', () => {
  it('returns the work result', async () => {
    const { unitOfWork } = harness();

    await expect(unitOfWork.commit(() => Promise.resolve('done'))).resolves.toBe('done');
  });

  it('opens a transaction, runs the work, stages messages, then commits — in that order', async () => {
    const { unitOfWork, journal } = harness();

    await unitOfWork.commit(async (events) => {
      journal.record('work');
      events.record(message('a'));
      await Promise.resolve();
    });

    expect(journal.entries).toEqual([
      'transaction:begin',
      'work',
      'outbox:append(1)',
      'outbox:client=tx',
      'transaction:commit',
    ]);
  });

  it('stages messages using the transaction client, not the base client', async () => {
    const { unitOfWork, journal } = harness();

    await unitOfWork.commit((events) => {
      events.record(message('a'));
      return Promise.resolve();
    });

    // The whole point of the ambient transaction: the writer never received a
    // scope, yet its insert lands inside the transaction.
    expect(journal.entries).toContain('outbox:client=tx');
  });

  it('stages every recorded message in one append', async () => {
    const { unitOfWork, staged } = harness();

    await unitOfWork.commit((events) => {
      events.record(message('a'), message('b'));
      events.record(message('c'));
      return Promise.resolve();
    });

    expect(staged).toHaveLength(1);
    expect(staged[0]?.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('still hands an empty batch to the writer, which is where the no-op lives', async () => {
    // The unit of work does not special-case "no events"; the writer returns early
    // for an empty batch. Keeping the short-circuit in one place means a caller
    // cannot get it wrong, and it is asserted directly in the writer's own spec.
    const { unitOfWork, journal, staged } = harness();

    await unitOfWork.commit(() => Promise.resolve());

    expect(journal.entries).toContain('outbox:append(0)');
    expect(staged).toEqual([[]]);
  });

  it('stages nothing when the work throws', async () => {
    const { unitOfWork, staged, journal } = harness();

    await expect(
      unitOfWork.commit((events) => {
        events.record(message('a'));
        return Promise.reject(new Error('write failed'));
      }),
    ).rejects.toThrow('write failed');

    expect(staged).toEqual([]);
    expect(journal.entries).toEqual(['transaction:begin', 'transaction:rollback']);
  });

  it('propagates a commit failure', async () => {
    const { unitOfWork } = harness({ failCommit: true });

    await expect(unitOfWork.commit(() => Promise.resolve('x'))).rejects.toThrow('commit failed');
  });

  it('makes the transaction ambient inside the work and clears it afterwards', async () => {
    const { unitOfWork, transactions } = harness();

    expect(transactions.current()).toBeUndefined();
    await unitOfWork.commit(() => {
      expect(transactions.current()).toBeDefined();
      return Promise.resolve();
    });
    expect(transactions.current()).toBeUndefined();
  });
});

describe('PrismaUnitOfWork nesting', () => {
  it('joins the transaction already in progress instead of opening a second one', async () => {
    const { unitOfWork, journal } = harness();

    await unitOfWork.commit(async (outer) => {
      outer.record(message('outer'));
      await unitOfWork.commit((inner) => {
        inner.record(message('inner'));
        return Promise.resolve();
      });
    });

    // Exactly one begin and one commit: the inner call must not create its own
    // commit boundary, or the outer work would lose atomicity.
    expect(journal.entries.filter((entry) => entry === 'transaction:begin')).toHaveLength(1);
    expect(journal.entries.filter((entry) => entry === 'transaction:commit')).toHaveLength(1);
  });

  it('stages the inner messages before the outer ones, since the inner commit resolves first', async () => {
    const { unitOfWork, staged } = harness();

    await unitOfWork.commit(async (outer) => {
      outer.record(message('outer'));
      await unitOfWork.commit((inner) => {
        inner.record(message('inner'));
        return Promise.resolve();
      });
    });

    expect(staged.map((batch) => batch.map((entry) => entry.id))).toEqual([['inner'], ['outer']]);
  });

  it('discards the outer messages when the outer work fails after a nested commit', async () => {
    // The nested call already staged its messages, but they were staged inside the
    // same transaction, so the rollback takes them with it. What this asserts is
    // that the outer failure still propagates rather than being masked.
    const { unitOfWork } = harness();

    await expect(
      unitOfWork.commit(async (outer) => {
        outer.record(message('outer'));
        await unitOfWork.commit(() => Promise.resolve());
        throw new Error('outer failed');
      }),
    ).rejects.toThrow('outer failed');
  });
});

describe('PrismaTransactionContext', () => {
  it('reports no active client outside a transaction', () => {
    expect(new PrismaTransactionContext().current()).toBeUndefined();
  });

  it('isolates concurrent call trees from each other', async () => {
    // The reason this is AsyncLocalStorage and not a field: two requests in flight
    // must not see each other's transaction.
    const transactions = new PrismaTransactionContext();
    const first = { marker: 'first' } as unknown as Prisma.TransactionClient;
    const second = { marker: 'second' } as unknown as Prisma.TransactionClient;

    const observed = await Promise.all([
      transactions.run(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return (transactions.current() as unknown as { marker: string }).marker;
      }),
      transactions.run(second, async () => {
        await Promise.resolve();
        return (transactions.current() as unknown as { marker: string }).marker;
      }),
    ]);

    expect(observed).toEqual(['first', 'second']);
  });
});
