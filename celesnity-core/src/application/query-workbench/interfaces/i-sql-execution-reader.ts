import type {
  SqlExecutionDetailView,
  SqlExecutionSummaryView,
} from '@application/query-workbench/read-models/sql-execution.view';

/**
 * Outbound read port for the SQL execution history projection.
 *
 * The reader exposes only durable metadata (status, columns, row counts,
 * statistics, structured failures, timestamps). Complete result sets are never
 * projected here; they are retained separately in an in-process read model
 * (Requirement 5.7).
 */
export interface ISqlExecutionReader {
  /** Lists executions most-recent-first. */
  listHistory(): Promise<readonly SqlExecutionSummaryView[]>;

  /** Loads the durable metadata for a single execution. */
  findById(id: string): Promise<SqlExecutionDetailView | undefined>;
}
