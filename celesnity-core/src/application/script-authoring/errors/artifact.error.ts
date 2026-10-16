/**
 * Port errors for the source-artifact store.
 *
 * Follows the domain convention: one error type carrying a discriminating code,
 * with static factories preferred over the constructor. This replaces six
 * one-per-variant classes. Every message is reproduced verbatim from the class
 * it replaces, because the HTTP layer surfaces some of them to callers.
 */

/**
 * Classifies an artifact-store failure.
 * - `ALREADY_EXISTS` -> 409: the deterministic key holds different content.
 * - `MISSING` -> 500: a published artifact has gone.
 * - `INTEGRITY` -> 500: content did not match its recorded hash or size.
 * - `STORAGE_UNAVAILABLE` -> 503: the object store could not be reached.
 * - `CLEANUP_FAILED` -> 503: a failed publication could not be rolled back.
 * - `VERSIONING_REQUIRED` -> 503: the bucket is not configured for versioning.
 */
export enum ArtifactErrorCode {
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  MISSING = 'MISSING',
  INTEGRITY = 'INTEGRITY',
  STORAGE_UNAVAILABLE = 'STORAGE_UNAVAILABLE',
  CLEANUP_FAILED = 'CLEANUP_FAILED',
  VERSIONING_REQUIRED = 'VERSIONING_REQUIRED',
}

/** The single error raised by the source-artifact store port. */
export class ArtifactError extends Error {
  public readonly code: ArtifactErrorCode;

  public constructor(code: ArtifactErrorCode, message: string) {
    super(message);
    this.name = 'ArtifactError';
    this.code = code;
  }

  public static alreadyExists(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.ALREADY_EXISTS,
      'The deterministic script artifact already exists with different content.',
    );
  }

  public static missing(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.MISSING,
      'The published script artifact is missing.',
    );
  }

  public static integrity(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.INTEGRITY,
      'The published script artifact failed its integrity check.',
    );
  }

  public static storageUnavailable(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.STORAGE_UNAVAILABLE,
      'The script artifact store is temporarily unavailable.',
    );
  }

  public static cleanupFailed(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.CLEANUP_FAILED,
      'The failed publication artifact could not be removed safely.',
    );
  }

  public static versioningRequired(): ArtifactError {
    return new ArtifactError(
      ArtifactErrorCode.VERSIONING_REQUIRED,
      'Versioning must be enabled for the script artifacts bucket.',
    );
  }

  /**
   * Narrows an unknown value to this error, optionally to specific codes. The
   * artifact store discriminates on these codes in a dozen places, so a single
   * readable guard matters more here than anywhere else.
   */
  public static is(error: unknown, ...codes: readonly ArtifactErrorCode[]): error is ArtifactError {
    return error instanceof ArtifactError && (codes.length === 0 || codes.includes(error.code));
  }
}
