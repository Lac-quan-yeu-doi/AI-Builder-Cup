import { randomUUID } from 'node:crypto';

import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import type { ISqlQueryGateway } from '@application/query-workbench/interfaces/i-sql-query-gateway';
import {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type { OutputColumn } from '@domain/chart/models/visualization-definition';
import type { IAnalyticalQueryExecutor } from '@application/chart/interfaces/i-analytical-query-executor';

export type ChartRunEvent =
  | { readonly type: 'STARTED'; readonly runId: string }
  | { readonly type: 'PROGRESS'; readonly statistics: Record<string, unknown> }
  | { readonly type: 'COLUMNS'; readonly columns: readonly OutputColumn[] }
  | { readonly type: 'ROWS'; readonly rows: readonly (readonly unknown[])[] }
  | {
      readonly type: 'SUCCEEDED';
      readonly rowCount: number;
      readonly byteCount: number;
      readonly truncated: boolean;
    }
  | { readonly type: 'FAILED'; readonly code: string; readonly message: string }
  | { readonly type: 'CANCELLED' | 'TIMED_OUT' };

export interface ChartRunLimits {
  readonly maxRows: number;
  readonly maxBytes: number;
}

export class ChartQueryExecutor implements IAnalyticalQueryExecutor {
  public constructor(
    private readonly gateway: ISqlQueryGateway,
    private readonly timeoutMs = 60_000,
  ) {}

  public async *execute(
    compiled: CompiledChartQuery,
    limits: ChartRunLimits,
    signal: AbortSignal,
    runId = randomUUID(),
  ): AsyncIterable<ChartRunEvent> {
    if (!Number.isInteger(limits.maxRows) || limits.maxRows < 1) {
      throw new Error('Chart maxRows must be a positive integer.');
    }
    if (!Number.isInteger(limits.maxBytes) || limits.maxBytes < 1) {
      throw new Error('Chart maxBytes must be a positive integer.');
    }
    yield { type: 'STARTED', runId };
    let page;
    let rows = 0;
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let columnsEmitted = false;
    let handle: { queryId?: string; nextPageUri?: string } = {};
    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort();
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      page = await this.gateway.submit(
        SqlStatement.create(compiled.sql),
        QueryContext.create(compiled.context.catalog, compiled.context.schema),
        controller.signal,
      );
      for (;;) {
        handle = { queryId: page.queryId, nextPageUri: page.nextPageUri };
        if (page.failure) {
          await this.gateway.cancel(handle).catch(() => undefined);
          yield {
            type: 'FAILED',
            code: page.failure.code ?? 'QUERY_FAILED',
            message: page.failure.message ?? 'Query failed.',
          };
          return;
        }
        if (page.statistics) yield { type: 'PROGRESS', statistics: { ...page.statistics } };
        if (page.columns && !columnsEmitted) {
          columnsEmitted = true;
          yield {
            type: 'COLUMNS',
            columns: page.columns.map((column) => ({
              name: column.name,
              type: column.type,
              family: outputColumnFamily(column.type),
            })),
          };
        }
        const emitted: (readonly unknown[])[] = [];
        for (const row of page.rows) {
          const size = Buffer.byteLength(JSON.stringify(row), 'utf8');
          if (rows >= limits.maxRows || bytes + size > limits.maxBytes) {
            truncated = true;
            break;
          }
          emitted.push(row);
          rows += 1;
          bytes += size;
        }
        if (emitted.length) yield { type: 'ROWS', rows: emitted };
        if (truncated || !page.nextPageUri) break;
        page = await this.gateway.fetchNext(page.nextPageUri, controller.signal);
      }
      if (truncated) await this.gateway.cancel(handle);
      yield { type: 'SUCCEEDED', rowCount: rows, byteCount: bytes, truncated };
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        await this.gateway.cancel(handle).catch(() => undefined);
        yield { type: timedOut ? 'TIMED_OUT' : 'CANCELLED' };
        return;
      }
      yield {
        type: 'FAILED',
        code: 'QUERY_EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Query execution failed.',
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', forwardAbort);
    }
  }
}

/** Map Trino's type vocabulary to the small family vocabulary owned by the chart domain. */
function outputColumnFamily(type: string): OutputColumn['family'] {
  const normalized = type.trim().toLowerCase();
  if (
    /^(?:tinyint|smallint|integer|bigint|real|double|decimal|numeric|decimals?)(?:\b|\()/u.test(
      normalized,
    )
  ) {
    return 'NUMBER';
  }
  if (/^(?:boolean|bool)\b/u.test(normalized)) return 'BOOLEAN';
  if (/^(?:date)\b/u.test(normalized)) return 'DATE';
  if (/^(?:timestamp|time)\b/u.test(normalized)) return 'TIMESTAMP';
  if (/^(?:varchar|char|string|varbinary|json|uuid)\b/u.test(normalized)) return 'STRING';
  return 'UNKNOWN';
}
