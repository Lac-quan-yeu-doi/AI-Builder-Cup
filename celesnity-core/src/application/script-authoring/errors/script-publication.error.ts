/**
 * Port errors for serialising script publication.
 *
 * Only one variant exists today, but it is expressed as a coded error anyway so
 * the context matches the convention used everywhere else. A second publication
 * failure mode becomes a new code rather than a new class.
 */

/**
 * Classifies a publication-coordination failure.
 * - `LOCK_UNAVAILABLE` -> 503: the advisory lock could not be taken.
 */
export enum ScriptPublicationErrorCode {
  LOCK_UNAVAILABLE = 'LOCK_UNAVAILABLE',
}

/** The single error raised by the script-publication lock port. */
export class ScriptPublicationError extends Error {
  public readonly code: ScriptPublicationErrorCode;

  public constructor(code: ScriptPublicationErrorCode, message: string) {
    super(message);
    this.name = 'ScriptPublicationError';
    this.code = code;
  }

  public static lockUnavailable(): ScriptPublicationError {
    return new ScriptPublicationError(
      ScriptPublicationErrorCode.LOCK_UNAVAILABLE,
      'The script publication lock is temporarily unavailable.',
    );
  }

  /** Narrows an unknown value to this error, optionally to specific codes. */
  public static is(
    error: unknown,
    ...codes: readonly ScriptPublicationErrorCode[]
  ): error is ScriptPublicationError {
    return (
      error instanceof ScriptPublicationError && (codes.length === 0 || codes.includes(error.code))
    );
  }
}
