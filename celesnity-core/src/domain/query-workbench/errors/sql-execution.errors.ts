/**
 * Domain errors for the Query Workbench context.
 *
 * A single error type carries a discriminating {@link SqlExecutionErrorCode}
 * rather than a separate class per variant. The HTTP adapter maps each code to
 * a status.
 */

/**
 * Classifies a query-workbench failure.
 * - `VALIDATION` -> 400.
 * - `READ_ONLY_VIOLATION` -> 422: a non-read-only statement was submitted.
 * - `NOT_FOUND` -> 404: the SQL execution was not found.
 * - `ILLEGAL_TRANSITION` -> 409: an illegal query status transition.
 * - `STATE_CONFLICT` -> 409: the SQL execution changed during an update.
 */
export enum SqlExecutionErrorCode {
  VALIDATION = 'VALIDATION',
  READ_ONLY_VIOLATION = 'READ_ONLY_VIOLATION',
  NOT_FOUND = 'NOT_FOUND',
  ILLEGAL_TRANSITION = 'ILLEGAL_TRANSITION',
  STATE_CONFLICT = 'STATE_CONFLICT',
}

/** The single error raised by the Query Workbench context. */
export class SqlExecutionError extends Error {
  public readonly code: SqlExecutionErrorCode;

  public constructor(code: SqlExecutionErrorCode, message: string) {
    super(message);
    this.name = 'SqlExecutionError';
    this.code = code;
  }

  public static validation(message: string): SqlExecutionError {
    return new SqlExecutionError(SqlExecutionErrorCode.VALIDATION, message);
  }

  public static readOnlyViolation(message: string): SqlExecutionError {
    return new SqlExecutionError(SqlExecutionErrorCode.READ_ONLY_VIOLATION, message);
  }

  public static notFound(): SqlExecutionError {
    return new SqlExecutionError(
      SqlExecutionErrorCode.NOT_FOUND,
      'The SQL execution was not found.',
    );
  }

  public static illegalTransition(from: string, to: string): SqlExecutionError {
    return new SqlExecutionError(
      SqlExecutionErrorCode.ILLEGAL_TRANSITION,
      `A SQL execution cannot move from ${from} to ${to}.`,
    );
  }

  public static stateConflict(): SqlExecutionError {
    return new SqlExecutionError(
      SqlExecutionErrorCode.STATE_CONFLICT,
      'The SQL execution changed while it was being updated.',
    );
  }
}
