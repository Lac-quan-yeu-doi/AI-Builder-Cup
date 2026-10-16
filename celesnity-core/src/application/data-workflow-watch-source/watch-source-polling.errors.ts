export type WatchSourcePollingErrorCode =
  | 'INVALID_CHECKPOINT'
  | 'UNRELIABLE_CURSOR'
  | 'SOURCE_QUERY_FAILED'
  | 'SOURCE_TIMEOUT'
  | 'UNSUPPORTED_CHANGE_TYPE';

/** Safe operational error; it deliberately excludes SQL, identifiers, cursor values and credentials. */
export class WatchSourcePollingError extends Error {
  public constructor(public readonly code: WatchSourcePollingErrorCode) {
    super(`Watch Source polling failed (${code}).`);
    this.name = 'WatchSourcePollingError';
  }
}
