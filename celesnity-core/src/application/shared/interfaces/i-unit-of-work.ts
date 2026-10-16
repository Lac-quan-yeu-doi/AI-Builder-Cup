import type { OutboxMessage } from '@application/shared/outbox-message';

/**
 * Where a use case hands over the integration messages its work produced.
 *
 * Recording is not publishing. The unit of work stages every recorded message in
 * the outbox inside the same transaction as the writes that caused it, so the
 * row and the message either both land or neither does. Actual delivery is the
 * relay's job, later and out of band.
 */
export interface RecordedEvents {
  record(...messages: readonly OutboxMessage[]): void;
}

/**
 * A single atomic unit of persistence work.
 *
 * This port replaces the previous pair of `ITransactionManager` and
 * `IOutboxWriter`. Those two were always injected together and always used in
 * the same shape — open a transaction, write, append each event to the outbox,
 * commit — and each of the four call sites had reimplemented the append loop.
 *
 * More importantly, they forced a `TransactionScope` parameter onto every
 * repository method that needed to enlist, which meant:
 *
 *  - the application layer carried a persistence concept it could not describe
 *    (`TransactionScope.kind` was a bare string, checked at runtime by the
 *    adapter with `instanceof`, so passing the wrong scope failed at runtime
 *    rather than at compile time);
 *  - methods without the parameter silently could not enlist, which is how
 *    reads and some updates ended up running outside the surrounding
 *    transaction without anything in the signature saying so.
 *
 * Here the transaction is ambient instead: `commit` establishes it, and the
 * adapters resolve it themselves. A repository method cannot accidentally opt
 * out, because there is nothing to opt out of.
 *
 * Calls nest safely — a `commit` inside a `commit` joins the transaction already
 * in progress rather than opening a second one, so the outermost call is the
 * only one that commits.
 */
export interface IUnitOfWork {
  commit<T>(work: (events: RecordedEvents) => Promise<T>): Promise<T>;
}
