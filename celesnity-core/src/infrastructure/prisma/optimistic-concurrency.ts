/**
 * Every guarded write in this application is an `updateMany` whose `where`
 * clause repeats the state the aggregate was loaded in. That gives optimistic
 * concurrency without row locks: the update only lands while nobody else has
 * moved the row on.
 *
 * The tell is the affected-row count, and `count === 1` is easy to misread as an
 * ordinary sanity check. These helpers name what it actually means, so the
 * intent survives at every call site even though the guard itself differs per
 * aggregate (status, revision, or `updatedAt`).
 */
export interface AffectedRows {
  readonly count: number;
}

/** True when the guard still held and the write was applied. */
export function guardHeld(result: AffectedRows): boolean {
  return result.count === 1;
}

/** True when another writer moved the row first, so the write was skipped. */
export function guardLost(result: AffectedRows): boolean {
  return !guardHeld(result);
}
