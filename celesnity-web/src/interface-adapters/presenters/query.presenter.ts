import type {
  QueryFailure,
  QueryStatistics,
  ResultColumn,
  SqlCatalog,
  SqlExecutionAccepted,
  SqlExecutionEvent,
  SqlExecutionResult,
  SqlExecutionStatus,
  SqlExecutionSummary,
  SqlNamespace,
} from '@/src/entities/models/query';

export interface SqlCatalogViewModel {
  readonly name: string;
  readonly jdbcCatalogIdentity: string;
}

export interface SqlNamespaceViewModel {
  readonly catalog: string;
  readonly name: string;
}

export interface SqlExecutionAcceptedViewModel {
  readonly id: string;
  readonly status: SqlExecutionStatus;
}

export interface SqlExecutionSummaryViewModel {
  readonly id: string;
  readonly status: SqlExecutionStatus;
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

export interface SqlExecutionResultViewModel {
  readonly id: string;
  readonly status: SqlExecutionStatus;
  readonly catalog: string;
  readonly namespace?: string;
  readonly sql: string;
  readonly trinoQueryId?: string;
  readonly columns: readonly ResultColumn[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount?: number;
  readonly truncated: boolean;
  readonly resultsAvailable: boolean;
  readonly statistics?: QueryStatistics;
  readonly failure?: QueryFailure;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

export interface SqlExecutionEventViewModel {
  readonly id: string;
  readonly status: SqlExecutionStatus;
  readonly finished: boolean;
  readonly progressPercentage?: number;
  readonly state?: string;
  readonly rowCount?: number;
  readonly errorCode?: string;
  readonly updatedAt: string;
}

export function presentQueryCatalog(catalog: SqlCatalog): SqlCatalogViewModel {
  return { name: catalog.name, jdbcCatalogIdentity: catalog.jdbcCatalogIdentity };
}

export function presentQueryCatalogs(
  catalogs: readonly SqlCatalog[],
): readonly SqlCatalogViewModel[] {
  return catalogs.map(presentQueryCatalog);
}

export function presentQueryNamespace(namespace: SqlNamespace): SqlNamespaceViewModel {
  return { catalog: namespace.catalog, name: namespace.name };
}

export function presentQueryNamespaces(
  namespaces: readonly SqlNamespace[],
): readonly SqlNamespaceViewModel[] {
  return namespaces.map(presentQueryNamespace);
}

export function presentQueryAccepted(
  accepted: SqlExecutionAccepted,
): SqlExecutionAcceptedViewModel {
  return { id: accepted.id, status: accepted.status };
}

export function presentQuerySummary(summary: SqlExecutionSummary): SqlExecutionSummaryViewModel {
  return {
    id: summary.id,
    status: summary.status,
    catalog: summary.catalog,
    statementPreview: summary.statementPreview,
    queuedAt: summary.queuedAt,
    updatedAt: summary.updatedAt,
    ...(summary.namespace !== undefined ? { namespace: summary.namespace } : {}),
    ...(summary.trinoQueryId !== undefined ? { trinoQueryId: summary.trinoQueryId } : {}),
    ...(summary.rowCount !== undefined ? { rowCount: summary.rowCount } : {}),
    ...(summary.errorCode !== undefined ? { errorCode: summary.errorCode } : {}),
    ...(summary.startedAt !== undefined ? { startedAt: summary.startedAt } : {}),
    ...(summary.finishedAt !== undefined ? { finishedAt: summary.finishedAt } : {}),
  };
}

export function presentQuerySummaries(
  summaries: readonly SqlExecutionSummary[],
): readonly SqlExecutionSummaryViewModel[] {
  return summaries.map(presentQuerySummary);
}

export function presentQueryResult(result: SqlExecutionResult): SqlExecutionResultViewModel {
  return {
    id: result.id,
    status: result.status,
    catalog: result.catalog,
    sql: result.sql,
    columns: result.columns.map((column) => ({ name: column.name, type: column.type })),
    rows: result.rows.map((row) => row.map(copyCell)),
    truncated: result.truncated,
    resultsAvailable: result.resultsAvailable,
    queuedAt: result.queuedAt,
    updatedAt: result.updatedAt,
    ...(result.namespace !== undefined ? { namespace: result.namespace } : {}),
    ...(result.trinoQueryId !== undefined ? { trinoQueryId: result.trinoQueryId } : {}),
    ...(result.rowCount !== undefined ? { rowCount: result.rowCount } : {}),
    ...(result.statistics !== undefined
      ? { statistics: presentStatistics(result.statistics) }
      : {}),
    ...(result.failure !== undefined ? { failure: presentFailure(result.failure) } : {}),
    ...(result.startedAt !== undefined ? { startedAt: result.startedAt } : {}),
    ...(result.finishedAt !== undefined ? { finishedAt: result.finishedAt } : {}),
  };
}

export function presentQueryEvent(event: SqlExecutionEvent): SqlExecutionEventViewModel {
  return {
    id: event.id,
    status: event.status,
    finished: event.finished,
    updatedAt: event.updatedAt,
    ...(event.progressPercentage !== undefined
      ? { progressPercentage: event.progressPercentage }
      : {}),
    ...(event.state !== undefined ? { state: event.state } : {}),
    ...(event.rowCount !== undefined ? { rowCount: event.rowCount } : {}),
    ...(event.errorCode !== undefined ? { errorCode: event.errorCode } : {}),
  };
}

function presentStatistics(statistics: QueryStatistics): QueryStatistics {
  return {
    ...(statistics.state !== undefined ? { state: statistics.state } : {}),
    ...(statistics.queued !== undefined ? { queued: statistics.queued } : {}),
    ...(statistics.progressPercentage !== undefined
      ? { progressPercentage: statistics.progressPercentage }
      : {}),
    ...(statistics.elapsedTimeMillis !== undefined
      ? { elapsedTimeMillis: statistics.elapsedTimeMillis }
      : {}),
    ...(statistics.queuedTimeMillis !== undefined
      ? { queuedTimeMillis: statistics.queuedTimeMillis }
      : {}),
    ...(statistics.cpuTimeMillis !== undefined ? { cpuTimeMillis: statistics.cpuTimeMillis } : {}),
    ...(statistics.processedRows !== undefined ? { processedRows: statistics.processedRows } : {}),
    ...(statistics.processedBytes !== undefined
      ? { processedBytes: statistics.processedBytes }
      : {}),
    ...(statistics.peakMemoryBytes !== undefined
      ? { peakMemoryBytes: statistics.peakMemoryBytes }
      : {}),
    ...(statistics.totalSplits !== undefined ? { totalSplits: statistics.totalSplits } : {}),
    ...(statistics.completedSplits !== undefined
      ? { completedSplits: statistics.completedSplits }
      : {}),
  };
}

function presentFailure(failure: QueryFailure): QueryFailure {
  return {
    code: failure.code,
    message: failure.message,
    ...(failure.location !== undefined
      ? { location: { line: failure.location.line, column: failure.location.column } }
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
