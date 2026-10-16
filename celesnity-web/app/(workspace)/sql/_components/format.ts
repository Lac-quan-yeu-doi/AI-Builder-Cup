import type { SqlExecutionStatus } from '@/src/entities/models/query';

const STATUS_LABELS: Record<SqlExecutionStatus, string> = {
  queued: 'Queued',
  submitted: 'Submitted',
  running: 'Running',
  cancelling: 'Cancelling',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
};

export function statusLabel(status: SqlExecutionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export function formatDuration(millis: number): string {
  if (millis < 1000) {
    return `${Math.round(millis)} ms`;
  }
  const seconds = millis / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatCellValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isNullValue(value: unknown): boolean {
  return value === null || value === undefined;
}
