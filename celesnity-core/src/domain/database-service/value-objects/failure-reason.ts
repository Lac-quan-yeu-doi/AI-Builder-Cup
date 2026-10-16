/**
 * The maximum stored length of a verification failure reason.
 *
 * Shared deliberately: `VerificationState.failed` rejects anything longer, and
 * `FailureReason` truncates to the same bound before it gets there. Two
 * independent copies of this number is how a reason that was fine at one
 * boundary starts failing at the next.
 */
export const MAX_FAILURE_REASON_LENGTH = 500;

const FALLBACK = 'Database connection verification failed.';

/**
 * A stored reason for a failed connection test.
 *
 * Normalization was duplicated in two places — the use case's private
 * `failureReason` helper and `sanitizedFailureReason` in the redaction module —
 * with the same fallback string and the same truncation. This owns it once.
 *
 * Note the division of labour: this value object does NOT redact. Redaction
 * needs the secret patterns, which live in the application layer, so callers
 * redact first and normalize second. What this guarantees is that whatever
 * arrives is non-blank and short enough for `VerificationState.failed` to accept.
 */
export class FailureReason {
  private constructor(public readonly value: string) {}

  /**
   * Normalizes an already-redacted reason: trim, substitute a generic reason
   * when nothing usable is left, then truncate.
   */
  public static from(reason: string | undefined): FailureReason {
    const trimmed = reason?.trim();
    const usable = trimmed === undefined || trimmed.length === 0 ? FALLBACK : trimmed;
    return new FailureReason(usable.slice(0, MAX_FAILURE_REASON_LENGTH));
  }

  public toString(): string {
    return this.value;
  }
}
