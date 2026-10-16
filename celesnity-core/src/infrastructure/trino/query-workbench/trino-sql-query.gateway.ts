import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GatewayFailure,
  GatewayStatistics,
  ISqlQueryGateway,
  SqlQueryHandle,
  SqlQueryPage,
} from '@application/query-workbench/interfaces/i-sql-query-gateway';
import type {
  QueryContext,
  SqlStatement,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';
import {
  TrinoStatementClient,
  type TrinoErrorBody,
  type TrinoStatementResponse,
  type TrinoStatsBody,
} from '@infrastructure/trino/query-workbench/trino-statement.client';

/**
 * Trino-backed implementation of {@link ISqlQueryGateway} (anti-corruption layer
 * for the Trino HTTP statement protocol).
 *
 * It submits statements with the execution's {@link QueryContext} applied as
 * `X-Trino-Catalog`/`X-Trino-Schema` headers, follows the `nextUri` cursor, and
 * cancels via HTTP DELETE. Statement failures are mapped into sanitized
 * structured metadata (Requirement 5.4); transport failures surface as a
 * categorized unavailable error.
 */
@Injectable()
export class TrinoSqlQueryGateway implements ISqlQueryGateway {
  private readonly client: TrinoStatementClient;

  public constructor(config: ConfigService) {
    this.client = new TrinoStatementClient(
      config.getOrThrow<string>('TRINO_URL'),
      config.getOrThrow<string>('TRINO_USER'),
      // getOrThrow, not get: the environment schema always supplies this key, with
      // an empty string when Trino needs no password. A missing key means the schema
      // and this adapter have drifted, which is worth failing on.
      config.getOrThrow<string>('TRINO_PASSWORD'),
    );
  }

  public async submit(
    statement: SqlStatement,
    context: QueryContext,
    signal: AbortSignal,
  ): Promise<SqlQueryPage> {
    const response = await this.client.submit(
      statement.value,
      { catalog: context.catalog, schema: context.namespace },
      signal,
    );
    return toPage(response);
  }

  public async fetchNext(nextPageUri: string, signal: AbortSignal): Promise<SqlQueryPage> {
    const response = await this.client.fetchNext(nextPageUri, signal);
    return toPage(response);
  }

  public async cancel(handle: SqlQueryHandle): Promise<void> {
    if (handle.nextPageUri !== undefined) {
      await this.client.delete(handle.nextPageUri);
      return;
    }
    if (handle.queryId !== undefined) {
      await this.client.delete(this.client.queryUri(handle.queryId));
    }
  }
}

function toPage(response: TrinoStatementResponse): SqlQueryPage {
  return {
    queryId: response.id,
    nextPageUri: response.nextUri,
    state: response.stats?.state,
    columns: response.columns?.map((column) => ({ name: column.name, type: column.type })),
    rows: Array.isArray(response.data) ? response.data : [],
    statistics: toStatistics(response.stats),
    failure: toFailure(response.error),
  };
}

function toStatistics(stats: TrinoStatsBody | undefined): GatewayStatistics | undefined {
  if (stats === undefined) {
    return undefined;
  }
  return {
    state: stats.state,
    queued: stats.queued,
    progressPercentage: stats.progressPercentage,
    elapsedTimeMillis: stats.elapsedTimeMillis,
    queuedTimeMillis: stats.queuedTimeMillis,
    cpuTimeMillis: stats.cpuTimeMillis,
    processedRows: stats.processedRows,
    processedBytes: stats.processedBytes,
    peakMemoryBytes: stats.peakMemoryBytes,
    totalSplits: stats.totalSplits,
    completedSplits: stats.completedSplits,
  };
}

function toFailure(error: TrinoErrorBody | undefined): GatewayFailure | undefined {
  if (error === undefined || error === null) {
    return undefined;
  }
  const code =
    error.errorName ??
    (typeof error.errorCode === 'number' ? `TRINO_${error.errorCode}` : undefined) ??
    SqlExecutionMessage.unknownFailureCode;
  const message = error.message ?? error.failureInfo?.message ?? 'The query failed.';
  const location =
    error.errorLocation === undefined
      ? undefined
      : { line: error.errorLocation.lineNumber, column: error.errorLocation.columnNumber };
  return { code, message, location };
}
