import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';
import type {
  SqlExecutionGetPayload,
  SqlExecutionSelect,
} from '@generated/prisma/models/SqlExecution';
import { toDomainQueryStatus } from '@infrastructure/prisma/query-workbench/query-status.boundary';
import { SqlExecutionMessage } from '@domain/query-workbench/errors/sql-execution.messages';
import type {
  QueryFailureView,
  QueryStatisticsView,
  ResultColumnView,
  SqlExecutionDetailView,
  SqlExecutionSummaryView,
} from '@application/query-workbench/read-models/sql-execution.view';

/** Longest statement preview a summary carries, including the ellipsis. */
const PREVIEW_LENGTH = 240;

/** Columns a history summary needs. Deliberately narrower than the detail view. */
export const SUMMARY_SELECTION = {
  id: true,
  status: true,
  catalog: true,
  namespace: true,
  sqlText: true,
  trinoQueryId: true,
  rowCount: true,
  errorCode: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
} as const satisfies SqlExecutionSelect;

/** Columns a single-execution detail view needs. */
export const DETAIL_SELECTION = {
  ...SUMMARY_SELECTION,
  columnMetadata: true,
  statistics: true,
  errorMessage: true,
  errorLocation: true,
} as const satisfies SqlExecutionSelect;

/** The row shape {@link SUMMARY_SELECTION} produces, derived from the schema. */
export type SummaryRecord = SqlExecutionGetPayload<{ select: typeof SUMMARY_SELECTION }>;

/** The row shape {@link DETAIL_SELECTION} produces, derived from the schema. */
export type DetailRecord = SqlExecutionGetPayload<{ select: typeof DETAIL_SELECTION }>;

/**
 * Projects SQL execution rows onto the read models.
 *
 * Kept apart from {@link SqlExecutionMapper} because this is not translation:
 * it derives a collapsed statement preview, infers truncation by comparing the
 * engine's processed-row count against the stored row count, and substitutes
 * fallbacks when a failure was recorded without a code or message. The
 * write-side mapper stays a pure shape conversion.
 *
 * Row payloads are never projected here. Only durable metadata lives in
 * Postgres; the capped rows are composed by the use case from the in-process
 * result store, which is why `rows` is empty and `resultsAvailable` is false.
 */
@Injectable()
export class SqlExecutionViewMapper {
  /** Projects a row onto a history summary. */
  public toSummaryView(record: SummaryRecord): SqlExecutionSummaryView {
    return {
      id: record.id,
      status: toDomainQueryStatus(record.status),
      catalog: record.catalog,
      namespace: record.namespace ?? undefined,
      statementPreview: this.preview(record.sqlText),
      trinoQueryId: record.trinoQueryId ?? undefined,
      rowCount: record.rowCount ?? undefined,
      errorCode: record.errorCode ?? undefined,
      queuedAt: record.queuedAt.toISOString(),
      startedAt: record.startedAt?.toISOString(),
      finishedAt: record.finishedAt?.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** Projects a row onto the detail view, without result rows. */
  public toDetailView(record: DetailRecord): SqlExecutionDetailView {
    const statistics = this.toStatistics(record.statistics);
    const rowCount = record.rowCount ?? undefined;
    return {
      id: record.id,
      status: toDomainQueryStatus(record.status),
      catalog: record.catalog,
      namespace: record.namespace ?? undefined,
      sql: record.sqlText,
      trinoQueryId: record.trinoQueryId ?? undefined,
      columns: this.toColumns(record.columnMetadata),
      rows: [],
      rowCount,
      truncated: this.derivedTruncation(statistics, rowCount),
      resultsAvailable: false,
      statistics,
      failure: this.toFailure(record),
      queuedAt: record.queuedAt.toISOString(),
      startedAt: record.startedAt?.toISOString(),
      finishedAt: record.finishedAt?.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** Collapses whitespace and caps length so a summary row stays one line. */
  private preview(sqlText: string): string {
    const collapsed = sqlText.replace(/\s+/gu, ' ').trim();
    return collapsed.length <= PREVIEW_LENGTH
      ? collapsed
      : `${collapsed.slice(0, PREVIEW_LENGTH - 1)}\u2026`;
  }

  private toColumns(value: Prisma.JsonValue | null): readonly ResultColumnView[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const columns: ResultColumnView[] = [];
    for (const entry of value) {
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const record = entry as Record<string, unknown>;
        if (typeof record.name === 'string' && typeof record.type === 'string') {
          columns.push({ name: record.name, type: record.type });
        }
      }
    }
    return columns;
  }

  private toStatistics(value: Prisma.JsonValue | null): QueryStatisticsView | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return value;
  }

  private toFailure(record: DetailRecord): QueryFailureView | undefined {
    if (record.errorCode === null && record.errorMessage === null) {
      return undefined;
    }
    return {
      code: record.errorCode ?? SqlExecutionMessage.unknownFailureCode,
      message: record.errorMessage ?? SqlExecutionMessage.unknownFailureMessage,
      location: this.readLocation(record.errorLocation),
    };
  }

  private readLocation(
    value: Prisma.JsonValue | null,
  ): { readonly line: number; readonly column: number } | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.line === 'number' && typeof record.column === 'number') {
      return { line: record.line, column: record.column };
    }
    return undefined;
  }

  /**
   * Trino reports how many rows it processed; when that exceeds the row count we
   * stored, the result was capped on the way in.
   */
  private derivedTruncation(
    statistics: QueryStatisticsView | undefined,
    rowCount: number | undefined,
  ): boolean {
    if (statistics === undefined || rowCount === undefined) {
      return false;
    }
    return typeof statistics.processedRows === 'number' && statistics.processedRows > rowCount;
  }
}
