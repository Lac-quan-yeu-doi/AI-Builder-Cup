import type { DomainEvent } from '@domain/shared/domain-event';

/**
 * Names of the domain events emitted by the DatabaseService aggregate.
 */
export enum DatabaseServiceEventName {
  Registered = 'DatabaseServiceRegistered',
  Changed = 'DatabaseServiceChanged',
  VerificationSucceeded = 'ConnectionVerificationSucceeded',
  VerificationFailed = 'ConnectionVerificationFailed',
  Archived = 'DatabaseServiceArchived',
}

/**
 * A domain event emitted by the DatabaseService aggregate. These variants carry no
 * payload beyond the base envelope, so a single event class discriminated by
 * {@link DatabaseServiceEventName} models them all.
 *
 * `eventId` is supplied by the caller, as it is for every other aggregate's
 * events. This class used to generate its own with `randomUUID` from
 * `node:crypto`, which made it the one file in the domain layer reaching for a
 * platform module. Two things followed from that: the id could not be controlled
 * from a test, and the domain quietly depended on an ambient source of
 * randomness. Taking it as a parameter puts the decision back with the
 * application layer, which already owns an id generator port for exactly this.
 */
export class DatabaseServiceEvent implements DomainEvent {
  public constructor(
    public readonly eventId: string,
    public readonly eventName: DatabaseServiceEventName,
    public readonly aggregateId: string,
    public readonly occurredAt: Date,
  ) {}
}
