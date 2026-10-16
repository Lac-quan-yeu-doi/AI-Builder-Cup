import { Buffer } from 'node:buffer';

export interface WatchSourceCheckpointValue {
  readonly change: string;
  readonly tie: string;
}

export const EMPTY_WATCH_SOURCE_CHECKPOINT = 'watch:v1:empty';

export function encodeWatchSourceCheckpoint(value: WatchSourceCheckpointValue): string {
  return `watch:v1:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
}

export function decodeWatchSourceCheckpoint(
  checkpoint: string,
): WatchSourceCheckpointValue | undefined {
  if (checkpoint === EMPTY_WATCH_SOURCE_CHECKPOINT) return undefined;
  if (!checkpoint.startsWith('watch:v1:')) throw new Error('Invalid Watch Source checkpoint.');
  const encoded = checkpoint.slice('watch:v1:'.length);
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!isCheckpointValue(parsed)) throw new Error('Invalid Watch Source checkpoint.');
    return parsed;
  } catch {
    throw new Error('Invalid Watch Source checkpoint.');
  }
}

function isCheckpointValue(value: unknown): value is WatchSourceCheckpointValue {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.change === 'string' &&
    record.change.length > 0 &&
    typeof record.tie === 'string' &&
    record.tie.length > 0
  );
}
