export type SqlExecutionStatus =
  | 'queued'
  | 'submitted'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export const SQL_EXECUTION_STATUSES: readonly SqlExecutionStatus[] = [
  'queued',
  'submitted',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
];

const TERMINAL_STATUSES: ReadonlySet<SqlExecutionStatus> = new Set<SqlExecutionStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

export function isTerminalStatus(status: SqlExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isCancellableStatus(status: SqlExecutionStatus): boolean {
  return status === 'queued' || status === 'submitted' || status === 'running';
}

export interface QueryContext {
  readonly catalog: string;
  readonly namespace?: string;
}

export interface QueryEditorSession {
  readonly sql: string;
  readonly context: QueryContext;
}

export interface SqlCatalog {
  readonly name: string;
  readonly jdbcCatalogIdentity: string;
}

export interface SqlNamespace {
  readonly catalog: string;
  readonly name: string;
}

export interface SqlExecutionAccepted {
  readonly id: string;
  readonly status: SqlExecutionStatus;
}

export interface ResultColumn {
  readonly name: string;
  readonly type: string;
}

export interface QueryStatistics {
  readonly state?: string;
  readonly queued?: boolean;
  readonly progressPercentage?: number;
  readonly elapsedTimeMillis?: number;
  readonly queuedTimeMillis?: number;
  readonly cpuTimeMillis?: number;
  readonly processedRows?: number;
  readonly processedBytes?: number;
  readonly peakMemoryBytes?: number;
  readonly totalSplits?: number;
  readonly completedSplits?: number;
}

export interface QueryFailureLocation {
  readonly line: number;
  readonly column: number;
}

export interface QueryFailure {
  readonly code: string;
  readonly message: string;
  readonly location?: QueryFailureLocation;
}

export interface SqlExecutionSummary {
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

export interface SqlExecutionResult {
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

export interface SqlExecutionEvent {
  readonly id: string;
  readonly status: SqlExecutionStatus;
  readonly finished: boolean;
  readonly progressPercentage?: number;
  readonly state?: string;
  readonly rowCount?: number;
  readonly errorCode?: string;
  readonly updatedAt: string;
}

/**
 * Read-only statement prefixes accepted by the Trino gateway. This is a client
 * convenience only: the Core API remains the authoritative validator and will
 * reject anything that mutates state regardless of what this heuristic reports.
 */
const READ_ONLY_PREFIXES: readonly string[] = [
  'select',
  'with',
  'show',
  'describe',
  'desc',
  'explain',
  'values',
  'table',
];

/**
 * Best-effort, non-authoritative check that a statement looks read-only so the
 * UI can surface a gentle hint before submitting. Leading SQL comments and
 * whitespace are stripped before inspecting the first keyword.
 */
export function looksReadOnly(sql: string): boolean {
  const normalized = stripLeadingNoise(sql);
  if (normalized.length === 0) {
    return true;
  }
  const firstToken = normalized.split(/[\s(]+/, 1)[0]?.toLowerCase() ?? '';
  return READ_ONLY_PREFIXES.includes(firstToken);
}

function stripLeadingNoise(sql: string): string {
  let text = sql.trim();
  for (;;) {
    if (text.startsWith('--')) {
      const newline = text.indexOf('\n');
      text = newline === -1 ? '' : text.slice(newline + 1).trimStart();
      continue;
    }
    if (text.startsWith('/*')) {
      const end = text.indexOf('*/');
      text = end === -1 ? '' : text.slice(end + 2).trimStart();
      continue;
    }
    break;
  }
  return text;
}
