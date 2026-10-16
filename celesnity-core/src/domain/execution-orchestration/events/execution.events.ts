import type { DomainEvent } from '@domain/shared/domain-event';
import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';

/**
 * Names of the domain events emitted by the Execution aggregate.
 */
export enum ExecutionEventName {
  Requested = 'ExecutionRequested',
  Preparing = 'ExecutionPreparing',
  Submitted = 'ExecutionSubmitted',
  Started = 'ExecutionStarted',
  Succeeded = 'ExecutionSucceeded',
  Failed = 'ExecutionFailed',
  CancellationRequested = 'ExecutionCancellationRequested',
  Cancelled = 'ExecutionCancelled',
  TimedOut = 'ExecutionTimedOut',
}

/**
 * Base domain event for the Execution aggregate. Payload-free variants are
 * instances of this class discriminated by {@link ExecutionEventName}; variants
 * that carry data extend it.
 */
export class ExecutionEvent implements DomainEvent {
  public constructor(
    public readonly eventId: string,
    public readonly eventName: ExecutionEventName,
    public readonly aggregateId: string,
    public readonly occurredAt: Date,
  ) {}
}

/** Emitted when an execution is first requested and queued. */
export class ExecutionRequestedEvent extends ExecutionEvent {
  public constructor(
    eventId: string,
    aggregateId: string,
    occurredAt: Date,
    public readonly workload: ExecutionWorkload,
    public readonly connectionId: string | undefined,
  ) {
    super(eventId, ExecutionEventName.Requested, aggregateId, occurredAt);
  }
}

/** Emitted when an execution finishes successfully. */
export class ExecutionSucceededEvent extends ExecutionEvent {
  public constructor(
    eventId: string,
    aggregateId: string,
    occurredAt: Date,
    public readonly exitCode: number,
    public readonly sparkApplicationId: string | undefined,
  ) {
    super(eventId, ExecutionEventName.Succeeded, aggregateId, occurredAt);
  }
}

/** Emitted when an execution fails. */
export class ExecutionFailedEvent extends ExecutionEvent {
  public constructor(
    eventId: string,
    aggregateId: string,
    occurredAt: Date,
    public readonly summary: string,
    public readonly exitCode: number | undefined,
  ) {
    super(eventId, ExecutionEventName.Failed, aggregateId, occurredAt);
  }
}
