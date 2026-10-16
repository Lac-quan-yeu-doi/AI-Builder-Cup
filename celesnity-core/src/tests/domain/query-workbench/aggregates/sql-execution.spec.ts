import { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import {
  SqlExecutionError,
  SqlExecutionErrorCode,
} from '@domain/query-workbench/errors/sql-execution.errors';
import {
  QueryColumns,
  QueryContext,
  QueryFailure,
  QueryStatistics,
  QueryStatus,
  QueryStatusValue,
  SqlExecutionId,
  SqlStatement,
  TrinoQueryId,
  isTerminalQueryStatus,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { SequentialIdGenerator } from '@tests/support/deterministic-ports';

/**
 * The SqlExecution lifecycle.
 *
 * Unlike Execution, this aggregate is driven by a single in-process runner rather
 * than competing workers, so the interesting cases are less about races and more
 * about the invariants a terminal state must satisfy — a finished query must have
 * a finish time, and a failure must carry structured, sanitized detail.
 */

const EXECUTION_ID = '66666666-6666-4666-8666-666666666666';
const QUEUED_AT = new Date('2026-08-04T10:00:00.000Z');
const LATER = new Date('2026-08-04T10:01:00.000Z');

const ALL_STATUSES: readonly QueryStatusValue[] = Object.values(QueryStatusValue);

function ids(): SequentialIdGenerator {
  return new SequentialIdGenerator();
}

function queued(sql = 'SELECT 1'): SqlExecution {
  return SqlExecution.queue(
    {
      id: SqlExecutionId.from(EXECUTION_ID),
      statement: SqlStatement.create(sql),
      context: QueryContext.create('iceberg', 'main'),
      queuedAt: QUEUED_AT,
    },
    ids().next(),
  );
}

function at(status: QueryStatusValue): SqlExecution {
  const terminal = isTerminalQueryStatus(status);
  return SqlExecution.rehydrate({
    id: SqlExecutionId.from(EXECUTION_ID),
    statement: SqlStatement.create('SELECT 1'),
    context: QueryContext.create('iceberg', 'main'),
    status: QueryStatus.from(status),
    queuedAt: QUEUED_AT,
    finishedAt: terminal ? QUEUED_AT : undefined,
    updatedAt: QUEUED_AT,
  });
}

describe('SqlExecution.queue', () => {
  it.each([
    ['SELECT 1;', 'SELECT 1'],
    ["SELECT ';';", "SELECT ';'"],
    ['SELECT 1; -- trailing comment', 'SELECT 1 -- trailing comment'],
    ['SELECT 1 /* ; inside comment */;', 'SELECT 1 /* ; inside comment */'],
  ])('normalizes one trailing statement terminator: %s', (input, expected) => {
    expect(SqlStatement.create(input).value).toBe(expected);
  });

  it('does not normalize multiple statements into one', () => {
    const statement = SqlStatement.create('SELECT 1; SELECT 2');
    expect(statement.value).toBe('SELECT 1; SELECT 2');
    expect(() =>
      SqlExecution.queue(
        {
          id: SqlExecutionId.from(EXECUTION_ID),
          statement,
          context: QueryContext.create('iceberg', 'main'),
          queuedAt: QUEUED_AT,
        },
        ids().next(),
      ),
    ).toThrow(SqlExecutionError);
  });

  it('starts QUEUED and raises a submission event', () => {
    const execution = queued();

    expect(execution.status.value).toBe(QueryStatusValue.QUEUED);
    expect(execution.pullDomainEvents()).toHaveLength(1);
  });

  it('enforces the read-only policy at construction, not just at submission', () => {
    // Queueing a write would persist a row that can never legally run, so the
    // policy is applied before the aggregate exists.
    expect(() =>
      SqlExecution.queue(
        {
          id: SqlExecutionId.from(EXECUTION_ID),
          statement: SqlStatement.create('DELETE FROM orders'),
          context: QueryContext.create('iceberg', 'main'),
          queuedAt: QUEUED_AT,
        },
        ids().next(),
      ),
    ).toThrow(SqlExecutionError);
  });

  it('puts only a statement preview in the event, never the full SQL', () => {
    const execution = queued(`SELECT ${'a'.repeat(500)}`);

    const event = execution.pullDomainEvents()[0];
    const serialized = JSON.stringify(event);

    expect(serialized.length).toBeLessThan(500);
  });
});

describe('SqlExecution transitions', () => {
  it('walks QUEUED -> SUBMITTED -> RUNNING -> SUCCEEDED', () => {
    const execution = at(QueryStatusValue.QUEUED);

    execution.markSubmitted(TrinoQueryId.create('20260804_100000_00001_abcde'), LATER);
    execution.markRunning(LATER);
    execution.markSucceeded(
      QueryColumns.create([{ name: 'x', type: 'integer' }]),
      1,
      QueryStatistics.create({}),
      LATER,
    );

    expect(execution.status.value).toBe(QueryStatusValue.SUCCEEDED);
    expect(execution.rowCount).toBe(1);
  });

  it('records the Trino query id on submission so a detached cancel can find it', () => {
    const execution = at(QueryStatusValue.QUEUED);

    execution.markSubmitted(TrinoQueryId.create('20260804_100000_00001_abcde'), LATER);

    expect(execution.trinoQueryId?.value).toBe('20260804_100000_00001_abcde');
  });

  it('surfaces CANCELLING before CANCELLED so a caller can observe the intermediate state', () => {
    const execution = at(QueryStatusValue.RUNNING);

    execution.markCancelling(LATER);
    expect(execution.status.value).toBe(QueryStatusValue.CANCELLING);

    execution.markCancelled(LATER);
    expect(execution.status.value).toBe(QueryStatusValue.CANCELLED);
  });

  it('also allows cancelling directly from RUNNING, skipping CANCELLING', () => {
    // Deliberately more permissive than the Execution table. A SQL query is torn
    // down by the same in-process runner that started it, so it can observe the
    // cancellation and the teardown in one step; there is no second actor that
    // needs to see an intermediate state. Execution has to expose CANCELLING
    // because the API process requests it and a separate worker completes it.
    const execution = at(QueryStatusValue.RUNNING);

    execution.markCancelled(LATER);

    expect(execution.status.value).toBe(QueryStatusValue.CANCELLED);
  });

  it('allows RUNNING to re-record itself, since progress updates reuse the status', () => {
    const execution = at(QueryStatusValue.RUNNING);

    expect(() => {
      execution.markRunning(LATER);
    }).not.toThrow();
    expect(execution.status.value).toBe(QueryStatusValue.RUNNING);
  });

  it('permits exactly the documented transitions, walking the whole table', () => {
    const expected: Readonly<Record<QueryStatusValue, readonly QueryStatusValue[]>> = {
      [QueryStatusValue.QUEUED]: [
        QueryStatusValue.SUBMITTED,
        QueryStatusValue.CANCELLING,
        QueryStatusValue.CANCELLED,
        QueryStatusValue.FAILED,
        QueryStatusValue.TIMED_OUT,
      ],
      [QueryStatusValue.SUBMITTED]: [
        QueryStatusValue.RUNNING,
        QueryStatusValue.SUCCEEDED,
        QueryStatusValue.FAILED,
        QueryStatusValue.CANCELLING,
        QueryStatusValue.CANCELLED,
        QueryStatusValue.TIMED_OUT,
      ],
      [QueryStatusValue.RUNNING]: [
        QueryStatusValue.RUNNING,
        QueryStatusValue.SUCCEEDED,
        QueryStatusValue.FAILED,
        QueryStatusValue.CANCELLING,
        QueryStatusValue.CANCELLED,
        QueryStatusValue.TIMED_OUT,
      ],
      [QueryStatusValue.CANCELLING]: [
        QueryStatusValue.CANCELLED,
        QueryStatusValue.FAILED,
        QueryStatusValue.SUCCEEDED,
        QueryStatusValue.TIMED_OUT,
      ],
      [QueryStatusValue.SUCCEEDED]: [],
      [QueryStatusValue.FAILED]: [],
      [QueryStatusValue.CANCELLED]: [],
      [QueryStatusValue.TIMED_OUT]: [],
    };

    for (const from of ALL_STATUSES) {
      const status = QueryStatus.from(from);
      const permitted = ALL_STATUSES.filter((to) => status.canTransitionTo(to));
      expect([...permitted].sort()).toEqual([...expected[from]].sort());
    }
  });

  it('reports an illegal transition with the illegal-transition code', () => {
    expect.assertions(1);
    try {
      at(QueryStatusValue.SUCCEEDED).markRunning(LATER);
    } catch (error: unknown) {
      expect((error as SqlExecutionError).code).toBe(SqlExecutionErrorCode.ILLEGAL_TRANSITION);
    }
  });

  it.each(ALL_STATUSES.filter(isTerminalQueryStatus))(
    'refuses to move out of terminal status %s',
    (status) => {
      expect(() => {
        at(status).markFailed(QueryFailure.create({ code: 'X', message: 'y' }), LATER);
      }).toThrow(SqlExecutionError);
    },
  );

  it('supplies a default failure when timing out with no detail', () => {
    const execution = at(QueryStatusValue.RUNNING);

    execution.markTimedOut(LATER);

    expect(execution.status.value).toBe(QueryStatusValue.TIMED_OUT);
    expect(execution.failure?.code).toBe('QUERY_TIMEOUT');
  });

  it('sets startedAt when a query finishes without ever having been observed running', () => {
    // A fast query can go SUBMITTED -> SUCCEEDED with no RUNNING page, and a
    // terminal execution with no start time would be an inconsistent row.
    const execution = at(QueryStatusValue.SUBMITTED);

    execution.markSucceeded(QueryColumns.create([]), 0, QueryStatistics.create({}), LATER);

    expect(execution.startedAt).toEqual(LATER);
    expect(execution.finishedAt).toEqual(LATER);
  });

  it('clamps a backwards transition timestamp forward', () => {
    const execution = at(QueryStatusValue.QUEUED);

    execution.markSubmitted(
      TrinoQueryId.create('20260804_100000_00001_abcde'),
      new Date(QUEUED_AT.getTime() - 60_000),
    );

    expect(execution.updatedAt).toEqual(QUEUED_AT);
  });

  it('rejects a negative row count', () => {
    expect(() => {
      at(QueryStatusValue.RUNNING).markSucceeded(
        QueryColumns.create([]),
        -1,
        QueryStatistics.create({}),
        LATER,
      );
    }).toThrow(SqlExecutionError);
  });
});

describe('SqlExecution.rehydrate invariants', () => {
  it('rejects a terminal execution with no finish time', () => {
    expect(() =>
      SqlExecution.rehydrate({
        id: SqlExecutionId.from(EXECUTION_ID),
        statement: SqlStatement.create('SELECT 1'),
        context: QueryContext.create('iceberg', 'main'),
        status: QueryStatus.from(QueryStatusValue.SUCCEEDED),
        queuedAt: QUEUED_AT,
        updatedAt: QUEUED_AT,
      }),
    ).toThrow('A terminal SQL execution must have a finish time.');
  });

  it('rejects a start time before the queue time', () => {
    expect(() =>
      SqlExecution.rehydrate({
        id: SqlExecutionId.from(EXECUTION_ID),
        statement: SqlStatement.create('SELECT 1'),
        context: QueryContext.create('iceberg', 'main'),
        status: QueryStatus.from(QueryStatusValue.RUNNING),
        queuedAt: LATER,
        startedAt: QUEUED_AT,
        updatedAt: LATER,
      }),
    ).toThrow('Start time cannot precede the queue time.');
  });

  it('rejects a finish time before the start time', () => {
    expect(() =>
      SqlExecution.rehydrate({
        id: SqlExecutionId.from(EXECUTION_ID),
        statement: SqlStatement.create('SELECT 1'),
        context: QueryContext.create('iceberg', 'main'),
        status: QueryStatus.from(QueryStatusValue.SUCCEEDED),
        queuedAt: QUEUED_AT,
        startedAt: LATER,
        finishedAt: QUEUED_AT,
        updatedAt: LATER,
      }),
    ).toThrow('Finish time cannot precede the start time.');
  });
});
