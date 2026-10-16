import {
  VERIFICATION_OUTCOMES,
  VerificationStatusValue,
  isSuccessfulVerification,
  isVerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import {
  QueryStatus,
  QueryStatusValue,
  isQueryStatusValue,
  isTerminalQueryStatus,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import {
  ExecutionStatusValue,
  isExecutionStatusValue,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

/**
 * Asserts the domain-owned status vocabularies still contain exactly the members
 * every other layer, the database, and the published OpenAPI schema expect.
 *
 * The member lists are spelled out longhand on purpose. This is the one place a
 * literal copy is useful: it turns an accidental edit to a vocabulary into a
 * failing test rather than a silently different API contract. The assertions also
 * pin each member's *value*, because those strings are what get persisted.
 */
describe('domain status vocabularies', () => {
  it('VerificationStatusValue has exactly three members', () => {
    expect(Object.values(VerificationStatusValue)).toEqual(['UNTESTED', 'SUCCEEDED', 'FAILED']);
  });

  it('VERIFICATION_OUTCOMES derives the tested subset, excluding UNTESTED', () => {
    expect(VERIFICATION_OUTCOMES).toEqual([
      VerificationStatusValue.SUCCEEDED,
      VerificationStatusValue.FAILED,
    ]);
  });

  it('VERIFICATION_OUTCOMES stays a strict subset of the vocabulary', () => {
    for (const outcome of VERIFICATION_OUTCOMES) {
      expect(Object.values(VerificationStatusValue)).toContain(outcome);
    }
    expect(VERIFICATION_OUTCOMES).toHaveLength(Object.values(VerificationStatusValue).length - 1);
  });

  it('QueryStatusValue has exactly eight members in order', () => {
    expect(Object.values(QueryStatusValue)).toEqual([
      'QUEUED',
      'SUBMITTED',
      'RUNNING',
      'CANCELLING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'TIMED_OUT',
    ]);
  });

  it('ExecutionStatusValue keeps its nine members, including PREPARING', () => {
    expect(Object.values(ExecutionStatusValue)).toEqual([
      'QUEUED',
      'PREPARING',
      'SUBMITTED',
      'RUNNING',
      'CANCELLING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'TIMED_OUT',
    ]);
  });

  it('the query and execution vocabularies differ only by PREPARING', () => {
    // Recorded so the two are not "helpfully" unified: a SQL query is never
    // staged the way a Spark submission is.
    const queryStatuses: readonly string[] = Object.values(QueryStatusValue);

    expect(
      Object.values(ExecutionStatusValue).filter((status) => !queryStatuses.includes(status)),
    ).toEqual([ExecutionStatusValue.PREPARING]);
  });

  it('every member name maps to its own persisted spelling', () => {
    // A string enum whose member value drifts from its name would silently
    // change what lands in the database.
    for (const [name, value] of Object.entries(VerificationStatusValue)) {
      expect(value).toBe(name);
    }
    for (const [name, value] of Object.entries(QueryStatusValue)) {
      expect(value).toBe(name);
    }
    for (const [name, value] of Object.entries(ExecutionStatusValue)) {
      expect(value).toBe(name);
    }
  });
});

describe('vocabulary type guards', () => {
  it.each(Object.values(VerificationStatusValue))(
    'accepts the verification member %s',
    (member) => {
      expect(isVerificationStatusValue(member)).toBe(true);
    },
  );

  it.each(Object.values(QueryStatusValue))('accepts the query member %s', (member) => {
    expect(isQueryStatusValue(member)).toBe(true);
  });

  it.each(Object.values(ExecutionStatusValue))('accepts the execution member %s', (member) => {
    expect(isExecutionStatusValue(member)).toBe(true);
  });

  it.each(['', 'succeeded', 'UNKNOWN', 'PREPARING'])(
    'rejects %p as a query status',
    (candidate) => {
      expect(isQueryStatusValue(candidate)).toBe(false);
    },
  );

  it('rejects a member of a sibling vocabulary', () => {
    // PREPARING is an execution status and must not pass as a query status.
    expect(isQueryStatusValue(ExecutionStatusValue.PREPARING)).toBe(false);
    expect(isVerificationStatusValue(QueryStatusValue.QUEUED)).toBe(false);
  });
});

describe('isTerminalQueryStatus', () => {
  it('is true for the four final statuses', () => {
    expect(Object.values(QueryStatusValue).filter(isTerminalQueryStatus)).toEqual([
      QueryStatusValue.SUCCEEDED,
      QueryStatusValue.FAILED,
      QueryStatusValue.CANCELLED,
      QueryStatusValue.TIMED_OUT,
    ]);
  });

  it('is false for every in-flight status', () => {
    expect(
      Object.values(QueryStatusValue).filter((status) => !isTerminalQueryStatus(status)),
    ).toEqual([
      QueryStatusValue.QUEUED,
      QueryStatusValue.SUBMITTED,
      QueryStatusValue.RUNNING,
      QueryStatusValue.CANCELLING,
    ]);
  });

  it('agrees with QueryStatus.isTerminal for every member', () => {
    for (const status of Object.values(QueryStatusValue)) {
      expect(isTerminalQueryStatus(status)).toBe(QueryStatus.from(status).isTerminal);
    }
  });
});

describe('isSuccessfulVerification', () => {
  it('is true only for SUCCEEDED', () => {
    expect(isSuccessfulVerification(VerificationStatusValue.SUCCEEDED)).toBe(true);
    expect(isSuccessfulVerification(VerificationStatusValue.FAILED)).toBe(false);
  });

  it('covers every member of VERIFICATION_OUTCOMES', () => {
    expect(VERIFICATION_OUTCOMES.filter(isSuccessfulVerification)).toEqual([
      VerificationStatusValue.SUCCEEDED,
    ]);
  });
});
