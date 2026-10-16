import { Injectable } from '@nestjs/common';

import { Prisma } from '@generated/prisma/client';
import type {
  SqlExecutionGetPayload,
  SqlExecutionSelect,
} from '@generated/prisma/models/SqlExecution';
import { toPrismaQueryStatus } from '@infrastructure/prisma/query-workbench/query-status.boundary';
import { SqlExecution } from '@domain/query-workbench/aggregates/sql-execution';
import {
  QueryColumns,
  QueryContext,
  QueryFailure,
  QueryStatistics,
  QueryStatus,
  SqlExecutionId,
  SqlStatement,
  TrinoQueryId,
  type ResultColumn,
} from '@domain/query-workbench/value-objects/sql-execution-value-objects';

/** The SQL-execution columns this mapper reads. */
export const SQL_EXECUTION_SELECTION = {
  id: true,
  sqlText: true,
  catalog: true,
  namespace: true,
  status: true,
  trinoQueryId: true,
  columnMetadata: true,
  rowCount: true,
  statistics: true,
  errorCode: true,
  errorMessage: true,
  errorLocation: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
} as const satisfies SqlExecutionSelect;

/** The row shape {@link SQL_EXECUTION_SELECTION} produces, derived from the schema. */
export type SqlExecutionRecord = SqlExecutionGetPayload<{
  select: typeof SQL_EXECUTION_SELECTION;
}>;

/**
 * Translates between the {@link SqlExecution} aggregate and its row.
 *
 * Three columns hold Trino-shaped JSON (`columnMetadata`, `statistics`,
 * `errorLocation`). Each is decoded permissively: anything that does not match
 * the expected shape becomes absent rather than raising, because these columns
 * carry engine output that is informational, and losing a statistics blob must
 * never make a finished query unreadable.
 *
 * Writes go through `Prisma.DbNull` rather than `null` so that clearing a JSON
 * column stores a SQL NULL instead of the JSON value `null`.
 */
@Injectable()
export class SqlExecutionMapper {
  /** Rebuilds the aggregate from a persisted row. */
  public toDomain(record: SqlExecutionRecord): SqlExecution {
    return SqlExecution.rehydrate({
      id: SqlExecutionId.from(record.id),
      statement: SqlStatement.create(record.sqlText),
      context: QueryContext.create(record.catalog, record.namespace),
      status: QueryStatus.from(record.status),
      trinoQueryId:
        record.trinoQueryId === null ? undefined : TrinoQueryId.create(record.trinoQueryId),
      columns: this.toColumns(record.columnMetadata),
      rowCount: record.rowCount ?? undefined,
      statistics: this.toStatistics(record.statistics),
      failure: this.toFailure(record),
      queuedAt: record.queuedAt,
      startedAt: record.startedAt ?? undefined,
      finishedAt: record.finishedAt ?? undefined,
      updatedAt: record.updatedAt,
    });
  }

  /**
   * The columns an insert supplies. Only identity, statement and context are
   * known at submission; every result column is filled in by later transitions.
   */
  public toInsertPersistence(execution: SqlExecution): Prisma.SqlExecutionCreateInput {
    return {
      id: execution.id.value,
      sqlText: execution.statement.value,
      catalog: execution.context.catalog,
      namespace: execution.context.namespace ?? null,
      status: toPrismaQueryStatus(execution.status.value),
      queuedAt: execution.queuedAt,
      updatedAt: execution.updatedAt,
    };
  }

  /** The columns a status transition rewrites. */
  public toPersistence(execution: SqlExecution): Prisma.SqlExecutionUpdateManyMutationInput {
    return {
      status: toPrismaQueryStatus(execution.status.value),
      trinoQueryId: execution.trinoQueryId?.value ?? null,
      columnMetadata: this.jsonOrNull(execution.columns?.toJSON()),
      rowCount: execution.rowCount ?? null,
      statistics: this.jsonOrNull(execution.statistics?.toJSON()),
      errorCode: execution.failure?.code ?? null,
      errorMessage: execution.failure?.message ?? null,
      errorLocation: this.jsonOrNull(execution.failure?.location),
      startedAt: execution.startedAt ?? null,
      finishedAt: execution.finishedAt ?? null,
      updatedAt: execution.updatedAt,
    };
  }

  private jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === undefined || value === null) {
      return Prisma.DbNull;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toColumns(value: Prisma.JsonValue | null): QueryColumns | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const columns: ResultColumn[] = [];
    for (const entry of value) {
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        if (typeof record.name === 'string' && typeof record.type === 'string') {
          columns.push({ name: record.name, type: record.type });
        }
      }
    }
    return QueryColumns.create(columns);
  }

  private toStatistics(value: Prisma.JsonValue | null): QueryStatistics | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return QueryStatistics.create(value);
  }

  private toFailure(record: SqlExecutionRecord): QueryFailure | undefined {
    if (record.errorCode === null && record.errorMessage === null) {
      return undefined;
    }
    const location =
      typeof record.errorLocation === 'object' &&
      record.errorLocation !== null &&
      !Array.isArray(record.errorLocation)
        ? record.errorLocation
        : null;
    return QueryFailure.create({
      code: record.errorCode,
      message: record.errorMessage,
      location,
    });
  }
}
