import type { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import type {
  QueryStatusValue,
  SqlExecutionId,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/**
 * Outbound port for persisting and loading the {@link SqlExecution} aggregate.
 *
 * Writes are split into the insert performed when a statement is queued (inside
 * the submit unit of work, alongside its outbox message) and the status-guarded
 * updates the background runner applies as the query progresses. The status guard
 * provides optimistic concurrency: an update only succeeds when the persisted
 * status still matches the status the caller transitioned away from.
 */
export interface ISqlExecutionRepository {
  /** Inserts a freshly queued execution. Must run inside a unit of work. */
  create(execution: SqlExecution): Promise<void>;

  /** Loads the aggregate by id, or `undefined` when it does not exist. */
  findById(id: SqlExecutionId): Promise<SqlExecution | undefined>;

  /**
   * Persists the mutable state of the aggregate, but only when the stored status
   * equals `expectedStatus`. Returns `true` when exactly one row was updated and
   * `false` when the guard did not match.
   *
   * Not transactional by design: the runner drives a live query through many
   * transitions over the query's lifetime, and holding a transaction open across
   * Trino round trips would pin a connection for the duration of the query.
   */
  updateStatus(execution: SqlExecution, expectedStatus: QueryStatusValue): Promise<boolean>;
}
