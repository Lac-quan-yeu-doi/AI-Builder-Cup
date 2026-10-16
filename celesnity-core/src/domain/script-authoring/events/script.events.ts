import type { DomainEvent } from '@domain/shared/domain-event';

/**
 * Names of the domain events emitted by the Script aggregate.
 */
export enum ScriptEventName {
  Created = 'ScriptCreated',
  MetadataChanged = 'ScriptMetadataChanged',
  VersionPublished = 'ScriptVersionPublished',
  Archived = 'ScriptArchived',
}

/**
 * Base domain event for the Script aggregate. Payload-free variants are
 * instances of this class discriminated by {@link ScriptEventName}; variants
 * that carry data extend it.
 */
export class ScriptEvent implements DomainEvent {
  public constructor(
    public readonly eventId: string,
    public readonly eventName: ScriptEventName,
    public readonly aggregateId: string,
    public readonly occurredAt: Date,
  ) {}
}

/**
 * Emitted when a new immutable source version is published for a script.
 */
export class ScriptVersionPublishedEvent extends ScriptEvent {
  public constructor(
    eventId: string,
    aggregateId: string,
    occurredAt: Date,
    public readonly scriptVersionId: string,
    public readonly versionNumber: number,
  ) {
    super(eventId, ScriptEventName.VersionPublished, aggregateId, occurredAt);
  }
}
