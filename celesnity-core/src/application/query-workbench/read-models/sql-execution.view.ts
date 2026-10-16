import type { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/** A single result column and its Trino-visible type. */
export interface ResultColumnView {
  readonly name: string;
  readonly type: string;
}

/** Structured, sanitized query failure. */
export interface QueryFailureView {
  readonly code: string;
  readonly message: string;
  readonly location?: {
    readonly line: number;
    readonly column: number;
  };
}

/** Progress and resource statistics reported by Trino for the query. */
export interface QueryStatisticsView {
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

/** History list item: metadata only, no result payload. */
export interface SqlExecutionSummaryView {
  readonly id: string;
  readonly status: QueryStatusValue;
  readonly catalog: string;
  readonly namespace?: string;
  readonly statementPreview: string;
  readonly trinoQueryId?: string;
  readonly rowCount?: number;
  readonly errorCode?: string;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

/**
 * Detailed view of a single execution. `rows` are sourced from the in-process
 * result read model and may be empty when the retaining API instance is no
 * longer holding them (single-instance limitation, Requirement 5.7). `columns`,
 * `rowCount`, `statistics`, and `failure` are always sourced from durable
 * history metadata.
 */
export interface SqlExecutionDetailView {
  readonly id: string;
  readonly status: QueryStatusValue;
  readonly catalog: string;
  readonly namespace?: string;
  readonly sql: string;
  readonly trinoQueryId?: string;
  readonly columns: readonly ResultColumnView[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount?: number;
  readonly truncated: boolean;
  readonly resultsAvailable: boolean;
  readonly statistics?: QueryStatisticsView;
  readonly failure?: QueryFailureView;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

/** Lightweight status event emitted over the SSE progress stream. */
export interface SqlExecutionEventView {
  readonly id: string;
  readonly status: QueryStatusValue;
  readonly finished: boolean;
  readonly progressPercentage?: number;
  readonly state?: string;
  readonly rowCount?: number;
  readonly errorCode?: string;
  readonly updatedAt: string;
}
