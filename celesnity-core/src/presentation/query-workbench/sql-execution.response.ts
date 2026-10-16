import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { QueryStatusValue } from '@domain/query-workbench/value-objects/sql-execution-value-objects';
import type {
  QueryFailureView,
  QueryStatisticsView,
  SqlExecutionDetailView,
  SqlExecutionEventView,
  SqlExecutionSummaryView,
} from '@application/query-workbench/read-models/sql-execution.view';

export class SqlExecutionAcceptedResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: QueryStatusValue, example: 'QUEUED' })
  public readonly status!: QueryStatusValue;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Advisory correctness findings for the submitted SQL. Never blocks submission.',
  })
  public readonly warnings!: readonly string[];

  public static from(view: {
    id: string;
    status: QueryStatusValue;
    warnings: readonly string[];
  }): SqlExecutionAcceptedResponseDto {
    return Object.assign(new SqlExecutionAcceptedResponseDto(), {
      id: view.id,
      status: view.status,
      warnings: view.warnings,
    });
  }
}

export class SqlExecutionSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: QueryStatusValue })
  public readonly status!: QueryStatusValue;

  @ApiProperty({ example: 'iceberg' })
  public readonly catalog!: string;

  @ApiPropertyOptional({ example: 'analytics' })
  public readonly namespace?: string;

  @ApiProperty({ description: 'Whitespace-collapsed preview of the submitted SQL.' })
  public readonly statementPreview!: string;

  @ApiPropertyOptional({ description: 'Trino query identifier once assigned.' })
  public readonly trinoQueryId?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Retained row count for successful queries.' })
  public readonly rowCount?: number;

  @ApiPropertyOptional({ description: 'Sanitized failure code for failed/timed-out queries.' })
  public readonly errorCode?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly queuedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly finishedAt?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: SqlExecutionSummaryView): SqlExecutionSummaryResponseDto {
    return Object.assign(new SqlExecutionSummaryResponseDto(), {
      id: view.id,
      status: view.status,
      catalog: view.catalog,
      namespace: view.namespace,
      statementPreview: view.statementPreview,
      trinoQueryId: view.trinoQueryId,
      rowCount: view.rowCount,
      errorCode: view.errorCode,
      queuedAt: view.queuedAt,
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
      updatedAt: view.updatedAt,
    });
  }
}

export class ResultColumnResponseDto {
  @ApiProperty({ example: 'order_id' })
  public readonly name!: string;

  @ApiProperty({ example: 'bigint' })
  public readonly type!: string;
}

export class QueryFailureLocationResponseDto {
  @ApiProperty({ minimum: 1 })
  public readonly line!: number;

  @ApiProperty({ minimum: 1 })
  public readonly column!: number;
}

export class QueryFailureResponseDto {
  @ApiProperty({ example: 'TRINO_USER_ERROR' })
  public readonly code!: string;

  @ApiProperty()
  public readonly message!: string;

  @ApiPropertyOptional({ type: QueryFailureLocationResponseDto })
  public readonly location?: QueryFailureLocationResponseDto;

  public static from(view: QueryFailureView): QueryFailureResponseDto {
    return Object.assign(new QueryFailureResponseDto(), {
      code: view.code,
      message: view.message,
      location: view.location,
    });
  }
}

export class QueryStatisticsResponseDto {
  @ApiPropertyOptional({ example: 'RUNNING' })
  public readonly state?: string;

  @ApiPropertyOptional()
  public readonly queued?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  public readonly progressPercentage?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly elapsedTimeMillis?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly queuedTimeMillis?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly cpuTimeMillis?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly processedRows?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly processedBytes?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly peakMemoryBytes?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly totalSplits?: number;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly completedSplits?: number;

  public static from(view: QueryStatisticsView): QueryStatisticsResponseDto {
    return Object.assign(new QueryStatisticsResponseDto(), view);
  }
}

export class SqlExecutionDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: QueryStatusValue })
  public readonly status!: QueryStatusValue;

  @ApiProperty({ example: 'iceberg' })
  public readonly catalog!: string;

  @ApiPropertyOptional({ example: 'analytics' })
  public readonly namespace?: string;

  @ApiProperty({ description: 'The submitted SQL statement.' })
  public readonly sql!: string;

  @ApiPropertyOptional({ description: 'Trino query identifier once assigned.' })
  public readonly trinoQueryId?: string;

  @ApiProperty({ type: ResultColumnResponseDto, isArray: true })
  public readonly columns!: readonly ResultColumnResponseDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: {} },
    description:
      'Capped result rows aligned positionally to columns. Empty when the retaining API instance no longer holds them (see resultsAvailable).',
  })
  public readonly rows!: readonly (readonly unknown[])[];

  @ApiPropertyOptional({ minimum: 0, description: 'Retained row count.' })
  public readonly rowCount?: number;

  @ApiProperty({ description: 'True when more rows existed than the configured cap.' })
  public readonly truncated!: boolean;

  @ApiProperty({
    description: 'True when the capped result rows are still available in this API instance.',
  })
  public readonly resultsAvailable!: boolean;

  @ApiPropertyOptional({ type: QueryStatisticsResponseDto })
  public readonly statistics?: QueryStatisticsResponseDto;

  @ApiPropertyOptional({ type: QueryFailureResponseDto })
  public readonly failure?: QueryFailureResponseDto;

  @ApiProperty({ format: 'date-time' })
  public readonly queuedAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  public readonly finishedAt?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: SqlExecutionDetailView): SqlExecutionDetailResponseDto {
    return Object.assign(new SqlExecutionDetailResponseDto(), {
      id: view.id,
      status: view.status,
      catalog: view.catalog,
      namespace: view.namespace,
      sql: view.sql,
      trinoQueryId: view.trinoQueryId,
      columns: view.columns.map((column) => ({ name: column.name, type: column.type })),
      rows: view.rows,
      rowCount: view.rowCount,
      truncated: view.truncated,
      resultsAvailable: view.resultsAvailable,
      statistics:
        view.statistics === undefined
          ? undefined
          : QueryStatisticsResponseDto.from(view.statistics),
      failure: view.failure === undefined ? undefined : QueryFailureResponseDto.from(view.failure),
      queuedAt: view.queuedAt,
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
      updatedAt: view.updatedAt,
    });
  }
}

export class SqlExecutionEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  public readonly id!: string;

  @ApiProperty({ enum: QueryStatusValue })
  public readonly status!: QueryStatusValue;

  @ApiProperty({ description: 'True once the execution has reached a terminal status.' })
  public readonly finished!: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  public readonly progressPercentage?: number;

  @ApiPropertyOptional({ example: 'RUNNING' })
  public readonly state?: string;

  @ApiPropertyOptional({ minimum: 0 })
  public readonly rowCount?: number;

  @ApiPropertyOptional()
  public readonly errorCode?: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updatedAt!: string;

  public static from(view: SqlExecutionEventView): SqlExecutionEventResponseDto {
    return Object.assign(new SqlExecutionEventResponseDto(), {
      id: view.id,
      status: view.status,
      finished: view.finished,
      progressPercentage: view.progressPercentage,
      state: view.state,
      rowCount: view.rowCount,
      errorCode: view.errorCode,
      updatedAt: view.updatedAt,
    });
  }
}
