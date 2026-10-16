/**
 * Port errors for the execution-orchestration outbound dependencies.
 *
 * Follows the domain convention: one error type carrying a discriminating code,
 * with static factories preferred over the constructor. Replaces the separate
 * log-store and Spark-gateway classes.
 */

/**
 * Classifies an execution-orchestration port failure.
 * - `LOG_STORE_UNAVAILABLE` -> 503: the execution log object store is unreachable.
 * - `SPARK_UNAVAILABLE` -> 503: the Spark execution environment is unreachable.
 */
export enum ExecutionPortErrorCode {
  LOG_STORE_UNAVAILABLE = 'LOG_STORE_UNAVAILABLE',
  SPARK_UNAVAILABLE = 'SPARK_UNAVAILABLE',
}

/** The single error raised by the execution-orchestration ports. */
export class ExecutionPortError extends Error {
  public readonly code: ExecutionPortErrorCode;

  public constructor(code: ExecutionPortErrorCode, message: string) {
    super(message);
    this.name = 'ExecutionPortError';
    this.code = code;
  }

  public static logStoreUnavailable(): ExecutionPortError {
    return new ExecutionPortError(
      ExecutionPortErrorCode.LOG_STORE_UNAVAILABLE,
      'The execution log store is temporarily unavailable.',
    );
  }

  /**
   * The Spark adapter reports a redacted cause for some failures, so this
   * factory keeps the optional override the class it replaces offered. The HTTP
   * layer substitutes a generic message regardless; the detail is for logs.
   */
  public static sparkUnavailable(
    message = 'The Spark execution environment is temporarily unavailable.',
  ): ExecutionPortError {
    return new ExecutionPortError(ExecutionPortErrorCode.SPARK_UNAVAILABLE, message);
  }

  /** Narrows an unknown value to this error, optionally to specific codes. */
  public static is(
    error: unknown,
    ...codes: readonly ExecutionPortErrorCode[]
  ): error is ExecutionPortError {
    return (
      error instanceof ExecutionPortError && (codes.length === 0 || codes.includes(error.code))
    );
  }
}
