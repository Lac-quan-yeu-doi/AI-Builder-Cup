import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  EMPTY_WATCH_SOURCE_CHECKPOINT,
  decodeWatchSourceCheckpoint,
  encodeWatchSourceCheckpoint,
} from '@application/data-workflow-watch-source/watch-source-checkpoint';
import { WatchSourcePollingError } from '@application/data-workflow-watch-source/watch-source-polling.errors';
import type {
  WatchSourcePollingInput,
  WatchSourcePollingObservation,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter';

const POLLING_CHANGE_TYPES = ['INSERT', 'UPDATE'] as const;

export interface WatchSourceCursorRow {
  readonly change: unknown;
  readonly tie: unknown;
}

export function baselineFromRows(rows: readonly WatchSourceCursorRow[]): string {
  if (rows.length === 0) return EMPTY_WATCH_SOURCE_CHECKPOINT;
  return encodeWatchSourceCheckpoint(cursorFromRow(rows[0]!));
}

export function observationFromRows(
  input: WatchSourcePollingInput,
  rows: readonly WatchSourceCursorRow[],
): WatchSourcePollingObservation | undefined {
  if (rows.length === 0) return undefined;
  const fromCheckpoint = input.checkpoint;
  const throughCheckpoint = encodeWatchSourceCheckpoint(cursorFromRow(rows[rows.length - 1]!));
  const fingerprint = `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        relation: input.relation,
        fromCheckpoint,
        throughCheckpoint,
        count: rows.length,
      }),
    )
    .digest('hex')}`;
  return {
    fromCheckpoint,
    throughCheckpoint,
    fingerprint,
    changeTypes: [...POLLING_CHANGE_TYPES],
  };
}

export function cursorValues(checkpoint: string): readonly string[] {
  const decoded = decodeWatchSourceCheckpoint(checkpoint);
  return decoded === undefined ? [] : [decoded.change, decoded.tie];
}

export function assertPollInput(input: WatchSourcePollingInput): void {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10_000) {
    throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
  }
  if (input.signal.aborted || input.deadline.getTime() <= Date.now()) {
    throw new WatchSourcePollingError('SOURCE_TIMEOUT');
  }
}

function cursorFromRow(row: WatchSourceCursorRow): {
  readonly change: string;
  readonly tie: string;
} {
  return { change: normalizeCursorValue(row.change), tie: normalizeCursorValue(row.tie) };
}

function normalizeCursorValue(value: unknown): string {
  if (value === null || value === undefined) {
    throw new WatchSourcePollingError('UNRELIABLE_CURSOR');
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new WatchSourcePollingError('UNRELIABLE_CURSOR');
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64url');
  throw new WatchSourcePollingError('UNRELIABLE_CURSOR');
}
