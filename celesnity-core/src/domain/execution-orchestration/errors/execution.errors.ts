/**
 * Domain errors for the Execution Orchestration context.
 *
 * A single error type carries a discriminating {@link ExecutionErrorCode} rather
 * than a separate class per variant. The HTTP adapter maps each code to a status.
 */

/**
 * Classifies an execution-orchestration failure.
 * - `VALIDATION` -> 400.
 * - `NOT_FOUND` -> 404: the execution was not found.
 * - `TRANSITION` -> 409: an illegal execution status transition.
 * - `NOT_CANCELLABLE` -> 409: the execution can no longer be cancelled.
 * - `CONCURRENCY` -> 409: the execution changed during an update.
 */
export enum ExecutionErrorCode {
  VALIDATION = 'VALIDATION',
  NOT_FOUND = 'NOT_FOUND',
  TRANSITION = 'TRANSITION',
  NOT_CANCELLABLE = 'NOT_CANCELLABLE',
  CONCURRENCY = 'CONCURRENCY',
}

/** The single error raised by the Execution Orchestration context. */
export class ExecutionError extends Error {
  public readonly code: ExecutionErrorCode;

  public constructor(code: ExecutionErrorCode, message: string) {
    super(message);
    this.name = 'ExecutionError';
    this.code = code;
  }

  public static validation(message: string): ExecutionError {
    return new ExecutionError(ExecutionErrorCode.VALIDATION, message);
  }

  public static notFound(): ExecutionError {
    return new ExecutionError(ExecutionErrorCode.NOT_FOUND, 'The execution was not found.');
  }

  public static transition(from: string, to: string): ExecutionError {
    return new ExecutionError(
      ExecutionErrorCode.TRANSITION,
      `An execution cannot transition from ${from} to ${to}.`,
    );
  }

  public static notCancellable(): ExecutionError {
    return new ExecutionError(
      ExecutionErrorCode.NOT_CANCELLABLE,
      'The execution can no longer be cancelled.',
    );
  }

  public static concurrency(): ExecutionError {
    return new ExecutionError(
      ExecutionErrorCode.CONCURRENCY,
      'The execution changed while it was being updated. Retry with the latest state.',
    );
  }
}
