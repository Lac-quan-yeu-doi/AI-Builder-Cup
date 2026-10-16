import { Injectable } from '@nestjs/common';

import type {
  IQueryResultStore,
  StoredQueryResult,
} from '@application/query-workbench/interfaces/i-query-result-store';

// Bounds the number of retained result sets so long-lived API processes cannot
// grow unbounded. Eviction is least-recently-inserted; each entry is already
// capped at SQL_MAX_RESULT_ROWS rows by the runner.
const MAX_RETAINED_RESULTS = 256;

/**
 * In-process, single-instance cache of capped result sets keyed by execution id
 * (Requirement 5.7).
 *
 * LIMITATION: results live only in the memory of the API process that ran the
 * query. They are lost on restart and are not shared across instances. Durable
 * history metadata (columns, row count, statistics, structured failures) is
 * unaffected and always served from the database.
 */
@Injectable()
export class InMemoryQueryResultStore implements IQueryResultStore {
  private readonly results = new Map<string, StoredQueryResult>();

  public save(executionId: string, result: StoredQueryResult): void {
    // Refresh insertion order so recently written results are evicted last.
    this.results.delete(executionId);
    this.results.set(executionId, {
      columns: result.columns.map((column) => ({ name: column.name, type: column.type })),
      rows: result.rows,
      truncated: result.truncated,
    });
    this.evictOverflow();
  }

  public get(executionId: string): StoredQueryResult | undefined {
    return this.results.get(executionId);
  }

  public delete(executionId: string): void {
    this.results.delete(executionId);
  }

  private evictOverflow(): void {
    while (this.results.size > MAX_RETAINED_RESULTS) {
      const oldest = this.results.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.results.delete(oldest);
    }
  }
}
