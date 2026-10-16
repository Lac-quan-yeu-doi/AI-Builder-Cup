import type { DomainEvent } from '@domain/shared/domain-event';
import { SqlExecutionError } from '@domain/query-workbench/errors/sql-execution.errors';
import { SqlQuerySubmittedEvent } from '@domain/query-workbench/events/sql-execution.events';
import {
  type QueryColumns,
  type QueryContext,
  QueryFailure,
  type QueryStatistics,
  QueryStatus,
  type SqlExecutionId,
  type SqlStatement,
  type TrinoQueryId,
  QueryStatusValue,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';
import { SharedValidationMessage } from '@domain/shared/validation-messages';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DATABASE_INTEGER = 2_147_483_647;

/**
 * Full persistent state of a SQL execution used to rehydrate the aggregate.
 */
export interface SqlExecutionState {
  readonly id: SqlExecutionId;
  readonly statement: SqlStatement;
  readonly context: QueryContext;
  readonly status: QueryStatus;
  readonly trinoQueryId?: TrinoQueryId;
  readonly columns?: QueryColumns;
  readonly rowCount?: number;
  readonly statistics?: QueryStatistics;
  readonly failure?: QueryFailure;
  readonly queuedAt: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly updatedAt: Date;
}

function uuid(label: string, value: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw SqlExecutionError.validation(SharedValidationMessage.mustBeValidUuid(label));
  }
  return normalized.toLowerCase();
}

function dateValue(label: string, value: Date): Date {
  if (Number.isNaN(value.getTime())) {
    throw SqlExecutionError.validation(SharedValidationMessage.mustBeValidDate(label));
  }
  return new Date(value.getTime());
}

function rowCountValue(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_DATABASE_INTEGER) {
    throw SqlExecutionError.validation(
      SqlExecutionMessage.rowCountOutOfRange(MAX_DATABASE_INTEGER),
    );
  }
  return value;
}

/**
 * The SqlExecution aggregate models an ad-hoc, read-only SQL query submitted to
 * Trino through the Query Workbench. It owns the lifecycle state machine and
 * enforces a strict transition policy: no state may move to an incompatible
 * status, and terminal states are immutable.
 *
 * The aggregate is framework-free and knows nothing about Prisma, Trino, or
 * HTTP. Result rows are intentionally NOT part of the aggregate (only metadata,
 * columns, counts, statistics, and structured failures are); complete result
 * sets live in a separate in-process read model (Requirement 5.7).
 */
export class SqlExecution {
  private readonly domainEvents: DomainEvent[] = [];
  private readonly idValue: SqlExecutionId;
  private readonly statementValue: SqlStatement;
  private readonly contextValue: QueryContext;
  private statusValue: QueryStatus;
  private trinoQueryIdValue: TrinoQueryId | undefined;
  private columnsValue: QueryColumns | undefined;
  private rowCountValue: number | undefined;
  private statisticsValue: QueryStatistics | undefined;
  private failureValue: QueryFailure | undefined;
  private readonly queuedAtValue: Date;
  private startedAtValue: Date | undefined;
  private finishedAtValue: Date | undefined;
  private updatedAtValue: Date;

  private constructor(state: SqlExecutionState) {
    this.idValue = state.id;
    this.statementValue = state.statement;
    this.contextValue = state.context;
    this.statusValue = state.status;
    this.trinoQueryIdValue = state.trinoQueryId;
    this.columnsValue = state.columns;
    this.rowCountValue = state.rowCount === undefined ? undefined : rowCountValue(state.rowCount);
    this.statisticsValue = state.statistics;
    this.failureValue = state.failure;
    this.queuedAtValue = dateValue('Queue time', state.queuedAt);
    this.startedAtValue =
      state.startedAt === undefined ? undefined : dateValue('Start time', state.startedAt);
    this.finishedAtValue =
      state.finishedAt === undefined ? undefined : dateValue('Finish time', state.finishedAt);
    this.updatedAtValue = dateValue('Update time', state.updatedAt);

    if (this.updatedAtValue.getTime() < this.queuedAtValue.getTime()) {
      throw SqlExecutionError.validation(SqlExecutionMessage.updateBeforeQueue);
    }
    if (
      this.startedAtValue !== undefined &&
      this.startedAtValue.getTime() < this.queuedAtValue.getTime()
    ) {
      throw SqlExecutionError.validation(SqlExecutionMessage.startBeforeQueue);
    }
    if (
      this.finishedAtValue !== undefined &&
      this.startedAtValue !== undefined &&
      this.finishedAtValue.getTime() < this.startedAtValue.getTime()
    ) {
      throw SqlExecutionError.validation(SqlExecutionMessage.finishBeforeStart);
    }
    if (this.statusValue.isTerminal && this.finishedAtValue === undefined) {
      throw SqlExecutionError.validation(SqlExecutionMessage.terminalWithoutFinish);
    }
  }

  /**
   * Creates a freshly queued execution and records the submission event.
   * The read-only policy is enforced on the statement before queueing.
   */
  public static queue(
    input: {
      readonly id: SqlExecutionId;
      readonly statement: SqlStatement;
      readonly context: QueryContext;
      readonly queuedAt: Date;
    },
    eventId: string,
  ): SqlExecution {
    input.statement.assertReadOnly();
    const execution = new SqlExecution({
      id: input.id,
      statement: input.statement,
      context: input.context,
      status: QueryStatus.queued(),
      queuedAt: input.queuedAt,
      updatedAt: input.queuedAt,
    });
    execution.domainEvents.push(
      new SqlQuerySubmittedEvent(
        uuid('Domain event ID', eventId),
        execution.idValue.value,
        execution.queuedAt,
        execution.contextValue.catalog,
        execution.contextValue.namespace,
        execution.statementValue.preview(),
      ),
    );
    return execution;
  }

  public static rehydrate(state: SqlExecutionState): SqlExecution {
    return new SqlExecution(state);
  }

  public get id(): SqlExecutionId {
    return this.idValue;
  }

  public get statement(): SqlStatement {
    return this.statementValue;
  }

  public get context(): QueryContext {
    return this.contextValue;
  }

  public get status(): QueryStatus {
    return this.statusValue;
  }

  public get trinoQueryId(): TrinoQueryId | undefined {
    return this.trinoQueryIdValue;
  }

  public get columns(): QueryColumns | undefined {
    return this.columnsValue;
  }

  public get rowCount(): number | undefined {
    return this.rowCountValue;
  }

  public get statistics(): QueryStatistics | undefined {
    return this.statisticsValue;
  }

  public get failure(): QueryFailure | undefined {
    return this.failureValue;
  }

  public get queuedAt(): Date {
    return new Date(this.queuedAtValue.getTime());
  }

  public get startedAt(): Date | undefined {
    return this.startedAtValue === undefined ? undefined : new Date(this.startedAtValue.getTime());
  }

  public get finishedAt(): Date | undefined {
    return this.finishedAtValue === undefined
      ? undefined
      : new Date(this.finishedAtValue.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  /**
   * The execution was accepted by Trino and assigned a query identifier.
   */
  public markSubmitted(trinoQueryId: TrinoQueryId, at: Date): void {
    this.transitionTo(QueryStatusValue.SUBMITTED, at);
    this.trinoQueryIdValue = trinoQueryId;
  }

  /**
   * Trino began executing the statement.
   */
  public markRunning(at: Date): void {
    this.transitionTo(QueryStatusValue.RUNNING, at);
    if (this.startedAtValue === undefined) {
      this.startedAtValue = new Date(at.getTime());
    }
  }

  /**
   * The statement finished successfully. Only metadata is retained on the
   * aggregate; the row payload is stored in the in-process result read model.
   */
  public markSucceeded(
    columns: QueryColumns,
    rowCount: number,
    statistics: QueryStatistics,
    at: Date,
  ): void {
    this.transitionTo(QueryStatusValue.SUCCEEDED, at);
    this.columnsValue = columns;
    this.rowCountValue = rowCountValue(rowCount);
    this.statisticsValue = statistics;
    this.failureValue = undefined;
    this.markFinished(at);
  }

  /**
   * The statement failed. The failure is sanitized structured metadata
   * (code/message/optional source location) — no Trino internals leak.
   */
  public markFailed(failure: QueryFailure, at: Date, statistics?: QueryStatistics): void {
    this.transitionTo(QueryStatusValue.FAILED, at);
    this.failureValue = failure;
    if (statistics !== undefined) {
      this.statisticsValue = statistics;
    }
    this.markFinished(at);
  }

  /**
   * A cancellation was requested; the query is being torn down at Trino.
   */
  public markCancelling(at: Date): void {
    this.transitionTo(QueryStatusValue.CANCELLING, at);
  }

  /**
   * The query was cancelled and torn down.
   */
  public markCancelled(at: Date): void {
    this.transitionTo(QueryStatusValue.CANCELLED, at);
    this.markFinished(at);
  }

  /**
   * The query exceeded the configured timeout and was torn down.
   */
  public markTimedOut(at: Date, failure?: QueryFailure, statistics?: QueryStatistics): void {
    this.transitionTo(QueryStatusValue.TIMED_OUT, at);
    this.failureValue =
      failure ??
      QueryFailure.create({
        code: 'QUERY_TIMEOUT',
        message: 'The query exceeded the configured timeout and was cancelled.',
      });
    if (statistics !== undefined) {
      this.statisticsValue = statistics;
    }
    this.markFinished(at);
  }

  public pullDomainEvents(): readonly DomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private transitionTo(next: QueryStatusValue, at: Date): void {
    const timestamp = dateValue('Transition time', at);
    if (!this.statusValue.canTransitionTo(next)) {
      throw SqlExecutionError.illegalTransition(this.statusValue.value, next);
    }
    this.statusValue = QueryStatus.from(next);
    this.updatedAtValue =
      timestamp.getTime() < this.updatedAtValue.getTime() ? this.updatedAtValue : timestamp;
  }

  private markFinished(at: Date): void {
    const timestamp = dateValue('Finish time', at);
    this.finishedAtValue = timestamp;
    if (this.startedAtValue === undefined) {
      this.startedAtValue = timestamp;
    }
  }
}
