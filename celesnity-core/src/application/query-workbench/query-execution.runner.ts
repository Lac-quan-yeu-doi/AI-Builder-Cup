import type { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import {
  QueryColumns,
  QueryFailure,
  QueryStatistics,
  TrinoQueryId,
  QueryStatusValue,
  type ResultColumn,
  type SqlExecutionId,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IQueryResultStore } from '@application/query-workbench/interfaces/i-query-result-store';
import type { ISqlExecutionRepository } from '@application/query-workbench/interfaces/i-sql-execution-repository';
import {
  type GatewayStatistics,
  type ISqlQueryGateway,
  type SqlQueryHandle,
} from '@application/query-workbench/interfaces/i-sql-query-gateway';
import {
  QueryPortError,
  QueryPortErrorCode,
} from '@application/query-workbench/errors/query-port.error';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';

interface RunningTask {
  readonly controller: AbortController;
  promise: Promise<void>;
  timedOut: boolean;
  cancelRequested: boolean;
  handle: SqlQueryHandle;
}

// Bounded shutdown wait so a slow Trino teardown cannot block process exit.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;

/**
 * Drives asynchronous execution of queued SQL statements inside the API
 * process (Query Workbench has no separate worker, Requirement 5.3).
 *
 * For each scheduled execution the runner:
 *  - submits the statement to Trino and records the assigned query id,
 *  - follows the statement paging cursor (SUBMITTED -> RUNNING -> terminal),
 *  - enforces the configured timeout and the result row cap,
 *  - stores the capped result set in the in-process read model (Requirement 5.7),
 *  - persists status transitions, columns, row count, statistics, and any
 *    sanitized failure to durable history (Requirement 5.7),
 *  - cancels the query at Trino on cancellation, timeout, or row-cap overflow.
 *
 * The runner is the sole writer of a live execution's state, which keeps status
 * transitions race-free without database-level locking.
 */
export interface QueryRunnerLogger {
  error(message: string, detail?: string): void;
  warn(message: string): void;
}

export class QueryExecutionRunner {
  private readonly tasks = new Map<string, RunningTask>();
  private stopped = false;

  public constructor(
    private readonly repository: ISqlExecutionRepository,
    private readonly gateway: ISqlQueryGateway,
    private readonly resultStore: IQueryResultStore,
    private readonly clock: IClock,
    private readonly timeoutMs: number,
    private readonly maxRows: number,
    private readonly logger: QueryRunnerLogger,
  ) {}

  /**
   * Begins asynchronous execution of a queued statement. Returns immediately so
   * the submit HTTP request is not held open (Requirement 5.3).
   */
  public schedule(id: SqlExecutionId): void {
    if (this.stopped) {
      return;
    }
    const key = id.value;
    if (this.tasks.has(key)) {
      return;
    }
    const controller = new AbortController();
    const task: RunningTask = {
      controller,
      promise: Promise.resolve(),
      timedOut: false,
      cancelRequested: false,
      handle: {},
    };
    this.tasks.set(key, task);
    task.promise = this.drive(id, task)
      .catch((error: unknown) => {
        this.logger.error(`Unhandled SQL execution failure for ${key}`, describe(error));
      })
      .finally(() => {
        this.tasks.delete(key);
      });
  }

  /**
   * Requests cancellation of an execution. When the execution is running in
   * this instance the live task tears it down; otherwise the runner cancels it
   * directly using the persisted Trino query id (best-effort, single-instance
   * limitation for executions owned by another instance).
   */
  public async requestCancel(id: SqlExecutionId): Promise<void> {
    const task = this.tasks.get(id.value);
    if (task !== undefined) {
      task.cancelRequested = true;
      task.controller.abort();
      return;
    }
    await this.cancelDetached(id);
  }

  public async shutdown(): Promise<void> {
    this.stopped = true;
    const pending = [...this.tasks.values()];
    for (const task of pending) {
      task.cancelRequested = true;
      task.controller.abort();
    }
    await Promise.race([
      Promise.allSettled(pending.map((task) => task.promise)),
      delay(SHUTDOWN_DRAIN_TIMEOUT_MS),
    ]);
  }

  private async drive(id: SqlExecutionId, task: RunningTask): Promise<void> {
    const execution = await this.repository.findById(id);
    if (execution === undefined || execution.status.value !== QueryStatusValue.QUEUED) {
      return;
    }

    const columns: ResultColumn[] = [];
    const rows: unknown[][] = [];
    let statistics: GatewayStatistics | undefined;
    let capturedColumns = false;
    let truncated = false;
    let previousStatus: QueryStatusValue = QueryStatusValue.QUEUED;

    const timer = setTimeout(() => {
      task.timedOut = true;
      task.controller.abort();
    }, this.timeoutMs);

    try {
      let page = await this.gateway.submit(
        execution.statement,
        execution.context,
        task.controller.signal,
      );
      task.handle = { queryId: page.queryId, nextPageUri: page.nextPageUri };
      if (page.queryId === undefined) {
        throw QueryPortError.gatewayUnavailable('Trino did not return a query identifier.');
      }
      execution.markSubmitted(TrinoQueryId.create(page.queryId), this.clock.now());
      if (!(await this.persist(execution, previousStatus))) {
        return;
      }
      previousStatus = QueryStatusValue.SUBMITTED;

      for (;;) {
        if (page.failure !== undefined) {
          statistics = page.statistics ?? statistics;
          execution.markFailed(
            QueryFailure.create(page.failure),
            this.clock.now(),
            statistics === undefined ? undefined : QueryStatistics.create(statistics),
          );
          await this.persist(execution, previousStatus);
          return;
        }

        if (!capturedColumns && page.columns !== undefined && page.columns.length > 0) {
          for (const column of page.columns) {
            columns.push({ name: column.name, type: column.type });
          }
          capturedColumns = true;
        }
        if (page.statistics !== undefined) {
          statistics = page.statistics;
        }
        for (const row of page.rows) {
          if (rows.length >= this.maxRows) {
            truncated = true;
            break;
          }
          rows.push([...row]);
        }

        if (previousStatus === QueryStatusValue.SUBMITTED && isRunning(page.state, rows.length)) {
          execution.markRunning(this.clock.now());
          if (!(await this.persist(execution, previousStatus))) {
            return;
          }
          previousStatus = QueryStatusValue.RUNNING;
        }

        task.handle = {
          queryId: page.queryId ?? task.handle.queryId,
          nextPageUri: page.nextPageUri,
        };

        if (truncated) {
          await this.safeCancel(task.handle);
          break;
        }
        if (page.nextPageUri === undefined) {
          break;
        }
        page = await this.gateway.fetchNext(page.nextPageUri, task.controller.signal);
      }

      this.resultStore.save(id.value, {
        columns,
        rows,
        truncated,
      });
      execution.markSucceeded(
        QueryColumns.create(columns),
        rows.length,
        QueryStatistics.create(withTruncation(statistics, truncated, rows.length)),
        this.clock.now(),
      );
      await this.persist(execution, previousStatus);
    } catch (error: unknown) {
      await this.handleFailure(execution, task, previousStatus, statistics, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleFailure(
    execution: SqlExecution,
    task: RunningTask,
    previousStatus: QueryStatusValue,
    statistics: GatewayStatistics | undefined,
    error: unknown,
  ): Promise<void> {
    const parsedStatistics =
      statistics === undefined ? undefined : QueryStatistics.create(statistics);

    if (task.controller.signal.aborted) {
      await this.safeCancel(task.handle);
      if (task.timedOut) {
        execution.markTimedOut(this.clock.now(), undefined, parsedStatistics);
        await this.persist(execution, previousStatus);
        return;
      }
      // User-requested cancellation: surface the intermediate CANCELLING state.
      execution.markCancelling(this.clock.now());
      if (await this.persist(execution, previousStatus)) {
        execution.markCancelled(this.clock.now());
        await this.persist(execution, QueryStatusValue.CANCELLING);
      }
      return;
    }

    execution.markFailed(
      QueryFailure.create({ code: failureCode(error), message: describe(error) }),
      this.clock.now(),
      parsedStatistics,
    );
    await this.persist(execution, previousStatus);
  }

  private async cancelDetached(id: SqlExecutionId): Promise<void> {
    const execution = await this.repository.findById(id);
    if (execution === undefined || execution.status.isTerminal) {
      return;
    }
    const before = execution.status.value;
    execution.markCancelling(this.clock.now());
    if (!(await this.persist(execution, before))) {
      return;
    }
    await this.safeCancel({ queryId: execution.trinoQueryId?.value });
    execution.markCancelled(this.clock.now());
    await this.persist(execution, QueryStatusValue.CANCELLING);
  }

  private async persist(
    execution: SqlExecution,
    expectedStatus: QueryStatusValue,
  ): Promise<boolean> {
    try {
      return await this.repository.updateStatus(execution, expectedStatus);
    } catch (error: unknown) {
      this.logger.warn(`Failed to persist SQL execution ${execution.id.value}: ${describe(error)}`);
      return false;
    }
  }

  private async safeCancel(handle: SqlQueryHandle): Promise<void> {
    if (handle.queryId === undefined && handle.nextPageUri === undefined) {
      return;
    }
    try {
      await this.gateway.cancel(handle);
    } catch {
      // Cancellation is best-effort; Trino reclaims abandoned queries.
    }
  }
}

/**
 * Whether Trino has started executing, judged from the engine's own state string.
 *
 * `state` is TRINO's vocabulary, not {@link QueryStatusValue}. The two overlap on
 * the word "QUEUED" and nowhere else — `WAITING_FOR_RESOURCES` and `PLANNING`
 * have no domain counterpart — so these stay bare literals on purpose. Comparing
 * them against the domain enum would be a category error, and the enum lint rule
 * exists to catch exactly that.
 */
const TRINO_PRE_EXECUTION_STATES: ReadonlySet<string> = new Set([
  'QUEUED',
  'WAITING_FOR_RESOURCES',
  'PLANNING',
]);

function isRunning(state: string | undefined, rowsSeen: number): boolean {
  if (rowsSeen > 0) {
    return true;
  }
  if (state === undefined) {
    return false;
  }
  return !TRINO_PRE_EXECUTION_STATES.has(state);
}

function withTruncation(
  statistics: GatewayStatistics | undefined,
  truncated: boolean,
  retainedRows: number,
): GatewayStatistics {
  const base = statistics ?? {};
  if (!truncated) {
    return base;
  }
  const processedRows =
    typeof base.processedRows === 'number' && base.processedRows > retainedRows
      ? base.processedRows
      : retainedRows;
  return { ...base, processedRows };
}

function failureCode(error: unknown): string {
  return QueryPortError.is(error, QueryPortErrorCode.GATEWAY_UNAVAILABLE)
    ? 'TRINO_UNAVAILABLE'
    : SqlExecutionMessage.unknownFailureCode;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred while executing the query.';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
