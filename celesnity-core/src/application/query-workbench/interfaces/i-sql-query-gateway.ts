import type {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/** A result column descriptor as reported by the query engine. */
export interface GatewayColumn {
  readonly name: string;
  readonly type: string;
}

/** Sanitized failure information surfaced by the query engine. */
export interface GatewayFailure {
  readonly code?: string;
  readonly message?: string;
  readonly location?: {
    readonly line?: number;
    readonly column?: number;
  };
}

/** Statistics reported by the query engine for the running statement. */
export interface GatewayStatistics {
  readonly state?: string;
  readonly queued?: boolean;
  readonly progressPercentage?: number;
  readonly elapsedTimeMillis?: number;
  readonly queuedTimeMillis?: number;
  readonly cpuTimeMillis?: number;
  readonly processedRows?: number;
  readonly processedBytes?: number;
  readonly peakMemoryBytes?: number;
  readonly totalSplits?: number;
  readonly completedSplits?: number;
}

/**
 * One page of the Trino statement protocol. `nextPageUri` is an opaque token to
 * be passed back to {@link ISqlQueryGateway.fetchNext}; the application treats it
 * as a cursor without interpreting it.
 */
export interface SqlQueryPage {
  readonly queryId?: string;
  readonly nextPageUri?: string;
  readonly state?: string;
  readonly columns?: readonly GatewayColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly statistics?: GatewayStatistics;
  readonly failure?: GatewayFailure;
}

/** Handle used to cancel a running query at the engine. */
export interface SqlQueryHandle {
  readonly queryId?: string;
  readonly nextPageUri?: string;
}

/**
 * Outbound port for the Trino HTTP statement protocol (anti-corruption layer).
 * Implementations submit a statement, follow the paging cursor, and cancel a
 * query — translating every transport failure into a categorized error and
 * every statement failure into structured metadata.
 */
export interface ISqlQueryGateway {
  /** Submits a statement and returns the first protocol page. */
  submit(
    statement: SqlStatement,
    context: QueryContext,
    signal: AbortSignal,
  ): Promise<SqlQueryPage>;

  /** Fetches the next protocol page for an opaque cursor. */
  fetchNext(nextPageUri: string, signal: AbortSignal): Promise<SqlQueryPage>;

  /** Best-effort cancellation of a running query at the engine. */
  cancel(handle: SqlQueryHandle): Promise<void>;
}
