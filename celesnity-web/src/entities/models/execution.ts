export const EXECUTION_STATUSES = [
  'queued',
  'preparing',
  'submitted',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/**
 * Visual grouping used by the presentation layer to keep status styling in a
 * small, stable set instead of coupling to every individual lifecycle state.
 */
export type ExecutionStatusTone = 'pending' | 'active' | 'success' | 'danger' | 'muted';

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

const CANCELLABLE_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'queued',
  'preparing',
  'submitted',
  'running',
]);

const STATUS_LABELS: Readonly<Record<ExecutionStatus, string>> = {
  queued: 'Queued',
  preparing: 'Preparing',
  submitted: 'Submitted',
  running: 'Running',
  cancelling: 'Cancelling',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
};

const STATUS_TONES: Readonly<Record<ExecutionStatus, ExecutionStatusTone>> = {
  queued: 'pending',
  preparing: 'pending',
  submitted: 'pending',
  running: 'active',
  cancelling: 'active',
  succeeded: 'success',
  failed: 'danger',
  timed_out: 'danger',
  cancelled: 'muted',
};

export interface ExecutionResourceProfile {
  readonly driverMemory: string;
  readonly executorMemory: string;
  readonly executorCores: number;
  readonly maxCores: number;
}

export interface ExecutionSummary {
  readonly id: string;
  readonly workloadKind: 'SCRIPT' | 'PIPELINE';
  readonly executionPrincipal?: 'BACKGROUND' | 'REQUESTER';
  readonly versionNumber: number;
  readonly scriptId?: string;
  readonly scriptVersionId?: string;
  readonly pipelineId?: string;
  readonly pipelineVersionId?: string;
  readonly connectionId?: string;
  readonly status: ExecutionStatus;
  readonly sparkApplicationId?: string;
  readonly exitCode?: number;
  readonly errorSummary?: string;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt: string;
}

export interface ExecutionDetail extends ExecutionSummary {
  readonly resourceProfile?: ExecutionResourceProfile;
  readonly cancelledAt?: string;
}

export interface ExecutionLog {
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly bucket: string;
  readonly objectKey: string;
  readonly content: string;
  readonly byteSize: number;
}

/**
 * Incremental progress delivered over the live event stream. Only the fields
 * that can change mid-flight are present; the presentation layer patches them
 * onto the loaded detail and refetches the full record on terminal states.
 */
export interface ExecutionProgress {
  readonly id: string;
  readonly status: ExecutionStatus;
  readonly sparkApplicationId?: string;
  readonly exitCode?: number;
  readonly updatedAt: string;
}

export type RerunOutcome =
  | { readonly kind: 'started'; readonly executionId: string; readonly status: ExecutionStatus }
  | { readonly kind: 'version-missing' }
  | { readonly kind: 'conflict'; readonly message: string };

export interface FailureSummary {
  readonly headline: string;
  readonly detail?: string;
}

export function isTerminalExecution(status: ExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isCancellableExecution(status: ExecutionStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

export function executionStatusLabel(status: ExecutionStatus): string {
  return STATUS_LABELS[status];
}

export function executionStatusTone(status: ExecutionStatus): ExecutionStatusTone {
  return STATUS_TONES[status];
}

const POSTGRESQL_URL = /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi;
const URI_CREDENTIALS = /([a-z][a-z\d+.-]*:\/\/)[^/@\s]+@/gi;
const SECRET_ASSIGNMENT = /\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g;

const MAX_FAILURE_SUMMARY_LENGTH = 4000;

/**
 * Defence-in-depth cleanup for failure summaries. The Core API already redacts
 * secrets, but the UI strips residual credentials, connection strings, and
 * control characters before rendering untrusted operator-facing text.
 */
export function sanitizeFailureSummary(summary?: string): string | undefined {
  if (!summary) {
    return undefined;
  }

  const sanitized = summary
    .replace(/\r\n/g, '\n')
    .replace(POSTGRESQL_URL, 'PostgreSQL endpoint [redacted]')
    .replace(URI_CREDENTIALS, '$1[credentials redacted]@')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!sanitized) {
    return undefined;
  }

  return sanitized.length > MAX_FAILURE_SUMMARY_LENGTH
    ? `${sanitized.slice(0, MAX_FAILURE_SUMMARY_LENGTH - 3)}...`
    : sanitized;
}

/**
 * Splits a sanitized failure summary into a concise headline plus the remaining
 * detail so the error panel can present a clear cause without hiding the trace.
 */
export function describeFailure(summary?: string): FailureSummary | undefined {
  const sanitized = sanitizeFailureSummary(summary);
  if (!sanitized) {
    return undefined;
  }

  const newlineIndex = sanitized.indexOf('\n');
  if (newlineIndex === -1) {
    return { headline: sanitized };
  }

  const headline = sanitized.slice(0, newlineIndex).trim();
  const detail = sanitized.slice(newlineIndex + 1).trim();

  if (!headline) {
    return { headline: sanitized };
  }

  return detail ? { headline, detail } : { headline };
}
