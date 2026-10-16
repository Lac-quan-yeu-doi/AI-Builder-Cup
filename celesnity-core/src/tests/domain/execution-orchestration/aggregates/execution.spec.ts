import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import {
  ExecutionError,
  ExecutionErrorCode,
} from '@domain/execution-orchestration/errors/execution.errors';
import { ExecutionEventName } from '@domain/execution-orchestration/events/execution.events';
import {
  ExecutionFailure,
  ExecutionId,
  ExecutionStatusValue,
  LogLocation,
  ResourceProfile,
  SparkApplicationId,
  canTransition,
  isCancellableStatus,
  isTerminalStatus,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { SequentialIdGenerator } from '@tests/support/deterministic-ports';

/**
 * The Execution lifecycle, which is the most consequential state machine in the
 * codebase: it decides whether a Spark job may be started, cancelled, or reported
 * finished, and until now it had almost no coverage.
 *
 * Two properties are worth stating because the tests are organised around them:
 *
 *  - The transition table is exhaustively walked. Every (from, to) pair is
 *    exercised against `canTransition`, so an edge added or removed in the table
 *    without intent fails here rather than in production.
 *  - `startPreparing` is covered for the first time. It existed but was never
 *    called, because the queue dispatcher performed `QUEUED -> PREPARING` in raw
 *    SQL. Now that claiming goes through the aggregate, this transition is what
 *    makes claiming exclusive.
 */

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const SCRIPT_ID = '33333333-3333-4333-8333-333333333333';
const SCRIPT_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const CONNECTION_ID = '55555555-5555-4555-8555-555555555555';

const QUEUED_AT = new Date('2026-08-04T10:00:00.000Z');
const LATER = new Date('2026-08-04T10:05:00.000Z');

const ALL_STATUSES: readonly ExecutionStatusValue[] = Object.values(ExecutionStatusValue);

function profile(): ResourceProfile {
  return ResourceProfile.create({
    driverMemory: '1g',
    executorMemory: '1g',
    executorCores: 1,
    maxCores: 2,
  });
}

function ids(): SequentialIdGenerator {
  return new SequentialIdGenerator();
}

function requested(): Execution {
  return Execution.request(
    {
      id: ExecutionId.from(EXECUTION_ID),
      scriptId: SCRIPT_ID,
      scriptVersionId: SCRIPT_VERSION_ID,
      connectionId: CONNECTION_ID,
      resourceProfile: profile(),
      logLocation: LogLocation.forExecution('celesnity-artifacts', ExecutionId.from(EXECUTION_ID)),
      queuedAt: QUEUED_AT,
    },
    ids().next(),
  );
}

/** Rehydrates an execution directly into `status`, to test a transition in isolation. */
function at(status: ExecutionStatusValue): Execution {
  const terminal = isTerminalStatus(status);
  return Execution.rehydrate({
    id: ExecutionId.from(EXECUTION_ID),
    scriptId: SCRIPT_ID,
    scriptVersionId: SCRIPT_VERSION_ID,
    connectionId: CONNECTION_ID,
    status,
    resourceProfile: profile(),
    logLocation: LogLocation.forExecution('celesnity-artifacts', ExecutionId.from(EXECUTION_ID)),
    queuedAt: QUEUED_AT,
    finishedAt: terminal ? QUEUED_AT : undefined,
    updatedAt: QUEUED_AT,
  });
}

describe('Execution.request', () => {
  it('starts QUEUED', () => {
    expect(requested().status).toBe(ExecutionStatusValue.QUEUED);
  });

  it('raises exactly one ExecutionRequested event carrying the identifiers', () => {
    const execution = requested();

    const events = execution.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.eventName).toBe(ExecutionEventName.Requested);
    expect(events[0]?.aggregateId).toBe(EXECUTION_ID);
  });

  it('drains its events, so a second pull yields nothing', () => {
    const execution = requested();

    execution.pullDomainEvents();

    // Pull-once semantics matter: the unit of work records what it pulls, and a
    // second pull returning the same events would stage duplicates.
    expect(execution.pullDomainEvents()).toHaveLength(0);
  });

  it('rejects a malformed event id', () => {
    expect(() =>
      Execution.request(
        {
          id: ExecutionId.from(EXECUTION_ID),
          scriptId: SCRIPT_ID,
          scriptVersionId: SCRIPT_VERSION_ID,
          connectionId: CONNECTION_ID,
          resourceProfile: profile(),
          logLocation: LogLocation.forExecution('b-ucket', ExecutionId.from(EXECUTION_ID)),
          queuedAt: QUEUED_AT,
        },
        'not-a-uuid',
      ),
    ).toThrow('Domain event ID must be a valid UUID.');
  });

  it('rejects a malformed script id', () => {
    expect(() =>
      Execution.request(
        {
          id: ExecutionId.from(EXECUTION_ID),
          scriptId: 'nope',
          scriptVersionId: SCRIPT_VERSION_ID,
          connectionId: CONNECTION_ID,
          resourceProfile: profile(),
          logLocation: LogLocation.forExecution('b-ucket', ExecutionId.from(EXECUTION_ID)),
          queuedAt: QUEUED_AT,
        },
        ids().next(),
      ),
    ).toThrow('Script ID must be a valid UUID.');
  });
});

describe('Execution transition table', () => {
  const expected: Readonly<Record<ExecutionStatusValue, readonly ExecutionStatusValue[]>> = {
    [ExecutionStatusValue.QUEUED]: [
      ExecutionStatusValue.PREPARING,
      ExecutionStatusValue.CANCELLING,
    ],
    [ExecutionStatusValue.PREPARING]: [
      ExecutionStatusValue.SUBMITTED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.SUBMITTED]: [
      ExecutionStatusValue.RUNNING,
      ExecutionStatusValue.SUCCEEDED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.RUNNING]: [
      ExecutionStatusValue.SUCCEEDED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.CANCELLING,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.CANCELLING]: [
      ExecutionStatusValue.CANCELLED,
      ExecutionStatusValue.FAILED,
      ExecutionStatusValue.TIMED_OUT,
    ],
    [ExecutionStatusValue.SUCCEEDED]: [],
    [ExecutionStatusValue.FAILED]: [],
    [ExecutionStatusValue.CANCELLED]: [],
    [ExecutionStatusValue.TIMED_OUT]: [],
  };

  // Walks all 81 pairs. Restating the table and comparing it is the point: a
  // silent edit to the production table now has to be made here too.
  it.each(ALL_STATUSES)('permits exactly the documented transitions out of %s', (from) => {
    const permitted = ALL_STATUSES.filter((to) => canTransition(from, to));
    expect([...permitted].sort()).toEqual([...expected[from]].sort());
  });

  it.each(ALL_STATUSES.filter(isTerminalStatus))(
    'treats %s as terminal with no exits',
    (status) => {
      expect(ALL_STATUSES.filter((to) => canTransition(status, to))).toEqual([]);
    },
  );

  it('never permits a self-transition', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('classifies exactly the pre-terminal statuses as cancellable', () => {
    expect(ALL_STATUSES.filter(isCancellableStatus)).toEqual([
      ExecutionStatusValue.QUEUED,
      ExecutionStatusValue.PREPARING,
      ExecutionStatusValue.SUBMITTED,
      ExecutionStatusValue.RUNNING,
    ]);
  });

  it('never classifies a terminal status as cancellable', () => {
    for (const status of ALL_STATUSES.filter(isTerminalStatus)) {
      expect(isCancellableStatus(status)).toBe(false);
    }
  });
});

describe('Execution.startPreparing', () => {
  it('claims a queued execution and emits Preparing', () => {
    const execution = at(ExecutionStatusValue.QUEUED);

    execution.startPreparing(LATER, ids().next());

    expect(execution.status).toBe(ExecutionStatusValue.PREPARING);
    expect(execution.pullDomainEvents()[0]?.eventName).toBe(ExecutionEventName.Preparing);
  });

  it('refuses to re-claim an execution that is already preparing', () => {
    const execution = at(ExecutionStatusValue.PREPARING);

    expect(() => {
      execution.startPreparing(LATER, ids().next());
    }).toThrow(ExecutionError);
  });

  it.each([
    ExecutionStatusValue.SUBMITTED,
    ExecutionStatusValue.RUNNING,
    ExecutionStatusValue.CANCELLING,
    ExecutionStatusValue.SUCCEEDED,
    ExecutionStatusValue.FAILED,
    ExecutionStatusValue.CANCELLED,
    ExecutionStatusValue.TIMED_OUT,
  ])('refuses to claim from %s', (status) => {
    expect(() => {
      at(status).startPreparing(LATER, ids().next());
    }).toThrow(ExecutionError);
  });

  it('reports an illegal transition as a transition error', () => {
    expect.assertions(1);
    try {
      at(ExecutionStatusValue.SUCCEEDED).startPreparing(LATER, ids().next());
    } catch (error: unknown) {
      expect((error as ExecutionError).code).toBe(ExecutionErrorCode.TRANSITION);
    }
  });
});

describe('Execution lifecycle', () => {
  it('walks the full happy path QUEUED -> PREPARING -> SUBMITTED -> RUNNING -> SUCCEEDED', () => {
    const generator = ids();
    const execution = at(ExecutionStatusValue.QUEUED);

    execution.startPreparing(LATER, generator.next());
    execution.markSubmitted(
      SparkApplicationId.create('app-20260804-0001'),
      LATER,
      generator.next(),
    );
    execution.markRunning(LATER, generator.next());
    execution.markSucceeded(0, undefined, LATER, generator.next());

    expect(execution.status).toBe(ExecutionStatusValue.SUCCEEDED);
    expect(execution.exitCode).toBe(0);
    expect(execution.isTerminal).toBe(true);
    expect(execution.pullDomainEvents().map((event) => event.eventName)).toEqual([
      ExecutionEventName.Preparing,
      ExecutionEventName.Submitted,
      ExecutionEventName.Started,
      ExecutionEventName.Succeeded,
    ]);
  });

  it('records startedAt when it begins running', () => {
    const execution = at(ExecutionStatusValue.SUBMITTED);

    execution.markRunning(LATER, ids().next());

    expect(execution.startedAt).toEqual(LATER);
  });

  it('records finishedAt and cancelledAt when cancellation completes', () => {
    const generator = ids();
    const execution = at(ExecutionStatusValue.RUNNING);

    execution.requestCancellation(LATER, generator.next());
    execution.markCancelled(LATER, generator.next());

    expect(execution.status).toBe(ExecutionStatusValue.CANCELLED);
    expect(execution.cancelledAt).toEqual(LATER);
    expect(execution.finishedAt).toEqual(LATER);
  });

  it('clears any previous failure on success', () => {
    const generator = ids();
    const execution = at(ExecutionStatusValue.RUNNING);

    execution.markSucceeded(0, undefined, LATER, generator.next());

    expect(execution.failure).toBeUndefined();
  });

  it('retains the failure summary and exit code on failure', () => {
    const execution = at(ExecutionStatusValue.RUNNING);

    execution.markFailed(ExecutionFailure.create('boom', 3), LATER, ids().next());

    expect(execution.status).toBe(ExecutionStatusValue.FAILED);
    expect(execution.failure?.summary).toBe('boom');
    expect(execution.exitCode).toBe(3);
  });

  it('rejects an exit code outside the byte range', () => {
    expect(() => {
      at(ExecutionStatusValue.RUNNING).markSucceeded(256, undefined, LATER, ids().next());
    }).toThrow(ExecutionError);
    expect(() => {
      at(ExecutionStatusValue.RUNNING).markSucceeded(-1, undefined, LATER, ids().next());
    }).toThrow(ExecutionError);
  });

  it('attaches a Spark application id only once, so a later probe cannot overwrite it', () => {
    const execution = at(ExecutionStatusValue.RUNNING);

    execution.attachSparkApplicationId(SparkApplicationId.create('app-20260804-0001'));
    execution.attachSparkApplicationId(SparkApplicationId.create('app-20260804-9999'));

    expect(execution.sparkApplicationId?.value).toBe('app-20260804-0001');
  });

  it('clamps a backwards timestamp forward instead of moving updatedAt into the past', () => {
    // The queue is claimed with the database clock while transitions use the
    // application clock, so a small negative skew is expected and absorbed.
    const execution = at(ExecutionStatusValue.QUEUED);
    const earlier = new Date(QUEUED_AT.getTime() - 60_000);

    execution.startPreparing(earlier, ids().next());

    expect(execution.updatedAt).toEqual(QUEUED_AT);
  });

  it('refuses any transition out of a terminal state', () => {
    const generator = ids();
    for (const status of ALL_STATUSES.filter(isTerminalStatus)) {
      const execution = at(status);
      expect(() => {
        execution.markRunning(LATER, generator.next());
      }).toThrow(ExecutionError);
      expect(() => {
        execution.markCancelled(LATER, generator.next());
      }).toThrow(ExecutionError);
    }
  });
});

describe('Execution.rehydrate invariants', () => {
  it('rejects an update time before the queue time', () => {
    expect(() =>
      Execution.rehydrate({
        id: ExecutionId.from(EXECUTION_ID),
        scriptId: SCRIPT_ID,
        scriptVersionId: SCRIPT_VERSION_ID,
        connectionId: CONNECTION_ID,
        status: ExecutionStatusValue.QUEUED,
        resourceProfile: profile(),
        logLocation: LogLocation.forExecution('b-ucket', ExecutionId.from(EXECUTION_ID)),
        queuedAt: LATER,
        updatedAt: QUEUED_AT,
      }),
    ).toThrow('Execution update time cannot precede its queue time.');
  });

  it('rejects an invalid date', () => {
    expect(() =>
      Execution.rehydrate({
        id: ExecutionId.from(EXECUTION_ID),
        scriptId: SCRIPT_ID,
        scriptVersionId: SCRIPT_VERSION_ID,
        connectionId: CONNECTION_ID,
        status: ExecutionStatusValue.QUEUED,
        resourceProfile: profile(),
        logLocation: LogLocation.forExecution('b-ucket', ExecutionId.from(EXECUTION_ID)),
        queuedAt: new Date('nonsense'),
        updatedAt: QUEUED_AT,
      }),
    ).toThrow('Queued time must be a valid date.');
  });

  it('hands out copies of its dates, so a caller cannot mutate aggregate state', () => {
    const execution = at(ExecutionStatusValue.QUEUED);

    const queuedAt = execution.queuedAt;
    queuedAt.setFullYear(1999);

    expect(execution.queuedAt).toEqual(QUEUED_AT);
  });
});
