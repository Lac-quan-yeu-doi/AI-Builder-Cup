import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

/**
 * Port errors for cross-context access to a data connection.
 *
 * Follows the convention the domain layer established: one error type carrying a
 * discriminating code, with static factories preferred over the constructor.
 * This replaces five one-per-variant classes, two pairs of which carried
 * identical messages (the execution-profile and reference providers each had
 * their own "invalid id" and "not found" class).
 */

/**
 * Classifies a failure to resolve or reach a data connection.
 * - `INVALID_ID` -> 400: the supplied identifier is not a connection id.
 * - `NOT_FOUND` -> 404: no active connection matched.
 * - `DESTINATION_REJECTED` -> 400: the endpoint failed the destination policy.
 */
export enum ConnectionAccessErrorCode {
  INVALID_ID = 'INVALID_ID',
  NOT_FOUND = 'NOT_FOUND',
  NOT_VERIFIED = 'NOT_VERIFIED',
  DESTINATION_REJECTED = 'DESTINATION_REJECTED',
}

/** The single error raised by the database-service ports. */
export class ConnectionAccessError extends Error {
  public readonly code: ConnectionAccessErrorCode;

  public constructor(code: ConnectionAccessErrorCode, message: string) {
    super(message);
    this.name = 'ConnectionAccessError';
    this.code = code;
  }

  public static invalidId(): ConnectionAccessError {
    return new ConnectionAccessError(
      ConnectionAccessErrorCode.INVALID_ID,
      ConnectionMessage.invalidConnectionId,
    );
  }

  public static notFound(): ConnectionAccessError {
    return new ConnectionAccessError(
      ConnectionAccessErrorCode.NOT_FOUND,
      'The selected active connection was not found.',
    );
  }

  public static notVerified(): ConnectionAccessError {
    return new ConnectionAccessError(
      ConnectionAccessErrorCode.NOT_VERIFIED,
      'The selected database service must be verified before metadata crawling.',
    );
  }

  /**
   * The destination policy explains which rule the endpoint broke, so unlike the
   * other factories this one carries a caller-supplied message.
   */
  public static destinationRejected(message: string): ConnectionAccessError {
    return new ConnectionAccessError(ConnectionAccessErrorCode.DESTINATION_REJECTED, message);
  }

  /**
   * Narrows an unknown value to this error, optionally to specific codes.
   * Keeps discrimination at call sites to one readable expression instead of
   * repeating `instanceof` plus a code comparison.
   */
  public static is(
    error: unknown,
    ...codes: readonly ConnectionAccessErrorCode[]
  ): error is ConnectionAccessError {
    return (
      error instanceof ConnectionAccessError && (codes.length === 0 || codes.includes(error.code))
    );
  }
}
