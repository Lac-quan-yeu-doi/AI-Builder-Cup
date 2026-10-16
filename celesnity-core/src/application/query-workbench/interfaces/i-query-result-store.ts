/** A retained, capped result set for a single execution. */
export interface StoredQueryResult {
  readonly columns: readonly { readonly name: string; readonly type: string }[];
  readonly rows: readonly (readonly unknown[])[];
  readonly truncated: boolean;
}

/**
 * Outbound port for an in-process cache of complete-but-capped result sets,
 * keyed by execution id.
 *
 * IMPORTANT (Requirement 5.7): complete result sets are deliberately NOT
 * persisted to the durable store. Only up to `SQL_MAX_RESULT_ROWS` rows are
 * retained here, in the memory of the API process that ran the query. This is a
 * single-instance limitation: after a restart, or when served by a different
 * instance, the durable metadata (columns/rowCount/statistics/failure) is still
 * available but the row payload is not.
 */
export interface IQueryResultStore {
  save(executionId: string, result: StoredQueryResult): void;
  get(executionId: string): StoredQueryResult | undefined;
  delete(executionId: string): void;
}
