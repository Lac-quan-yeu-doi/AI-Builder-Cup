import {
  isTerminalQueryStatus,
  QueryStatusValue,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { ResultColumnView } from '@application/query-workbench/read-models/sql-execution.view';
import type { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';

const SQL_POLL_INTERVAL_MS = 100;
const SQL_POLL_TIMEOUT_MS = 60_000;

/** Rows plus any advisory correctness warnings the linter raised at submit time. */
export interface SqlRowsWithWarnings {
  readonly rows: readonly Record<string, unknown>[];
  readonly warnings: readonly string[];
}

/**
 * Submits `sql` to the query workbench and polls until it reaches a terminal
 * status, returning the result rows as plain objects keyed by column name,
 * plus any advisory lint warnings raised at submission time. Shared by
 * chart-mcp (`set_chart_data`) and trino-mcp (`run_query`) — both need the
 * same submit-then-poll-to-completion behavior rather than returning
 * celesnity-core's own async submission shape to the agent.
 */
export async function runSqlAndCollectRows(
  sql: string,
  queryWorkbench: QueryWorkbenchUseCases,
  options?: { catalog?: string; namespace?: string },
): Promise<SqlRowsWithWarnings> {
  const accepted = await queryWorkbench.submit({
    sql,
    catalog: options?.catalog,
    namespace: options?.namespace,
  });
  const deadline = Date.now() + SQL_POLL_TIMEOUT_MS;

  for (;;) {
    const detail = await queryWorkbench.get(accepted.id);
    if (detail.status === QueryStatusValue.SUCCEEDED) {
      return { rows: rowsToObjects(detail.columns, detail.rows), warnings: accepted.warnings };
    }
    if (isTerminalQueryStatus(detail.status)) {
      throw new Error(
        detail.failure?.message ?? `SQL execution ended with status ${detail.status}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for SQL execution to finish.');
    }
    await sleep(SQL_POLL_INTERVAL_MS);
  }
}

function rowsToObjects(
  columns: readonly ResultColumnView[],
  rows: readonly (readonly unknown[])[],
): readonly Record<string, unknown>[] {
  return rows.map((row) => {
    if (row.length !== columns.length) {
      throw new Error(
        `SQL result row has ${row.length} values but ${columns.length} columns were returned.`,
      );
    }
    const object: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      object[column.name] = row[index];
    });
    return object;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
