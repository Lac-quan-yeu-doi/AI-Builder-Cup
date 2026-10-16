import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';

/**
 * Holds the Prisma transaction client that is in effect for the current async
 * call stack.
 *
 * This is what makes the transaction ambient rather than a parameter. Before,
 * every repository method that needed to enlist took a `TransactionScope` and
 * unwrapped it with a runtime `instanceof` check; methods that did not take one
 * quietly ran on the base client, which is how reads inside a transaction ended
 * up reading committed state from outside it.
 *
 * `AsyncLocalStorage` is the right tool because the transaction's lifetime is
 * exactly one async call tree — the callback passed to `$transaction`. A store
 * entered there is visible to every `await` beneath it and to nothing else, so
 * two concurrent requests cannot see each other's transaction. That property is
 * what a module-level variable would get wrong.
 */
@Injectable()
export class PrismaTransactionContext {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  /** The active transaction client, or `undefined` outside a transaction. */
  public current(): Prisma.TransactionClient | undefined {
    return this.storage.getStore();
  }

  /** Runs `work` with `client` as the active transaction client. */
  public run<T>(client: Prisma.TransactionClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(client, work);
  }
}
