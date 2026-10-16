import type { QueryRepository } from '@/src/application/repositories/query.repository.interface';
import type {
  QueryEditorSession,
  QueryFailure,
  QueryStatistics,
  ResultColumn,
  SqlCatalog,
  SqlExecutionAccepted,
  SqlExecutionResult,
  SqlExecutionStatus,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type SubmitRequestDto = components['schemas']['SubmitSqlExecutionRequestDto'];
type AcceptedDto = components['schemas']['SqlExecutionAcceptedResponseDto'];
type SummaryDto = components['schemas']['SqlExecutionSummaryResponseDto'];
type DetailDto = components['schemas']['SqlExecutionDetailResponseDto'];
type ColumnDto = components['schemas']['ResultColumnResponseDto'];
type StatisticsDto = components['schemas']['QueryStatisticsResponseDto'];
type FailureDto = components['schemas']['QueryFailureResponseDto'];
type CatalogDto = components['schemas']['CatalogResponseDto'];
type NamespaceDto = components['schemas']['NamespaceResponseDto'];
type StatusDto = SummaryDto['status'];

const STATUS_FROM_DTO: Readonly<Record<StatusDto, SqlExecutionStatus>> = {
  QUEUED: 'queued',
  SUBMITTED: 'submitted',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
};

export class CoreApiQueryRepository implements QueryRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listCatalogs(): Promise<readonly SqlCatalog[]> {
    const response = await this.request<CatalogDto[]>('/catalogs', { method: 'GET' });
    return response.map(mapCatalog);
  }

  public async listNamespaces(catalog: string): Promise<readonly SqlNamespace[]> {
    const response = await this.request<NamespaceDto[]>(
      `/catalogs/${encodeURIComponent(catalog)}/schemas`,
      { method: 'GET' },
    );
    return response.map(mapNamespace);
  }

  public async listHistory(): Promise<readonly SqlExecutionSummary[]> {
    const response = await this.request<SummaryDto[]>('/sql-executions', { method: 'GET' });
    return response.map(mapSummary);
  }

  public async submit(session: QueryEditorSession): Promise<SqlExecutionAccepted> {
    const request: SubmitRequestDto = {
      sql: session.sql,
      ...(session.context.catalog ? { catalog: session.context.catalog } : {}),
      ...(session.context.namespace ? { namespace: session.context.namespace } : {}),
    };
    const response = await this.request<AcceptedDto>('/sql-executions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return { id: response.id, status: mapStatus(response.status) };
  }

  public async get(id: string): Promise<SqlExecutionResult> {
    const response = await this.request<DetailDto>(executionPath(id), { method: 'GET' });
    return mapDetail(response);
  }

  public async cancel(id: string): Promise<SqlExecutionResult> {
    const response = await this.request<DetailDto>(`${executionPath(id)}/cancel`, {
      method: 'POST',
    });
    return mapDetail(response);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function executionPath(id: string): string {
  return `/sql-executions/${encodeURIComponent(id)}`;
}

function mapStatus(status: StatusDto): SqlExecutionStatus {
  return STATUS_FROM_DTO[status] ?? 'queued';
}

function mapCatalog(dto: CatalogDto): SqlCatalog {
  return { name: dto.name, jdbcCatalogIdentity: dto.jdbcCatalogIdentity };
}

function mapNamespace(dto: NamespaceDto): SqlNamespace {
  return { catalog: dto.catalog, name: dto.name };
}

function mapSummary(dto: SummaryDto): SqlExecutionSummary {
  return {
    id: dto.id,
    status: mapStatus(dto.status),
    catalog: dto.catalog,
    statementPreview: dto.statementPreview,
    queuedAt: dto.queuedAt,
    updatedAt: dto.updatedAt,
    ...(dto.namespace !== undefined ? { namespace: dto.namespace } : {}),
    ...(dto.trinoQueryId !== undefined ? { trinoQueryId: dto.trinoQueryId } : {}),
    ...(dto.rowCount !== undefined ? { rowCount: dto.rowCount } : {}),
    ...(dto.errorCode !== undefined ? { errorCode: dto.errorCode } : {}),
    ...(dto.startedAt !== undefined ? { startedAt: dto.startedAt } : {}),
    ...(dto.finishedAt !== undefined ? { finishedAt: dto.finishedAt } : {}),
  };
}

function mapDetail(dto: DetailDto): SqlExecutionResult {
  return {
    id: dto.id,
    status: mapStatus(dto.status),
    catalog: dto.catalog,
    sql: dto.sql,
    columns: dto.columns.map(mapColumn),
    rows: dto.rows.map((row) => row.map(copyCell)),
    truncated: dto.truncated,
    resultsAvailable: dto.resultsAvailable,
    queuedAt: dto.queuedAt,
    updatedAt: dto.updatedAt,
    ...(dto.namespace !== undefined ? { namespace: dto.namespace } : {}),
    ...(dto.trinoQueryId !== undefined ? { trinoQueryId: dto.trinoQueryId } : {}),
    ...(dto.rowCount !== undefined ? { rowCount: dto.rowCount } : {}),
    ...(dto.statistics !== undefined ? { statistics: mapStatistics(dto.statistics) } : {}),
    ...(dto.failure !== undefined ? { failure: mapFailure(dto.failure) } : {}),
    ...(dto.startedAt !== undefined ? { startedAt: dto.startedAt } : {}),
    ...(dto.finishedAt !== undefined ? { finishedAt: dto.finishedAt } : {}),
  };
}

function mapColumn(dto: ColumnDto): ResultColumn {
  return { name: dto.name, type: dto.type };
}

function mapStatistics(dto: StatisticsDto): QueryStatistics {
  return {
    ...(dto.state !== undefined ? { state: dto.state } : {}),
    ...(dto.queued !== undefined ? { queued: dto.queued } : {}),
    ...(dto.progressPercentage !== undefined ? { progressPercentage: dto.progressPercentage } : {}),
    ...(dto.elapsedTimeMillis !== undefined ? { elapsedTimeMillis: dto.elapsedTimeMillis } : {}),
    ...(dto.queuedTimeMillis !== undefined ? { queuedTimeMillis: dto.queuedTimeMillis } : {}),
    ...(dto.cpuTimeMillis !== undefined ? { cpuTimeMillis: dto.cpuTimeMillis } : {}),
    ...(dto.processedRows !== undefined ? { processedRows: dto.processedRows } : {}),
    ...(dto.processedBytes !== undefined ? { processedBytes: dto.processedBytes } : {}),
    ...(dto.peakMemoryBytes !== undefined ? { peakMemoryBytes: dto.peakMemoryBytes } : {}),
    ...(dto.totalSplits !== undefined ? { totalSplits: dto.totalSplits } : {}),
    ...(dto.completedSplits !== undefined ? { completedSplits: dto.completedSplits } : {}),
  };
}

function mapFailure(dto: FailureDto): QueryFailure {
  return {
    code: dto.code,
    message: dto.message,
    ...(dto.location !== undefined
      ? { location: { line: dto.location.line, column: dto.location.column } }
      : {}),
  };
}

function copyCell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyCell);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, copyCell(nestedValue)]),
    );
  }
  return value;
}
