/**
 * Port errors for the query-workbench outbound dependencies.
 *
 * Statement-level failures are deliberately NOT errors: they travel on
 * `SqlQueryPage.failure` so the runner can persist structured failure metadata.
 * This type is only for transport failures.
 */

/**
 * Classifies a query-workbench port failure.
 * - `GATEWAY_UNAVAILABLE`: the query engine is unreachable or returned an
 *   unusable transport response. Deliberately unmapped by the HTTP layer, since
 *   the gateway is only reached from the background runner.
 */
export enum QueryPortErrorCode {
  GATEWAY_UNAVAILABLE = 'GATEWAY_UNAVAILABLE',
}

/** The single error raised by the query-workbench ports. */
export class QueryPortError extends Error {
  public readonly code: QueryPortErrorCode;

  public constructor(code: QueryPortErrorCode, message: string) {
    super(message);
    this.name = 'QueryPortError';
    this.code = code;
  }

  /**
   * Keeps the optional message override the class it replaces offered; the
   * runner distinguishes "no query identifier" from a plain transport failure.
   */
  public static gatewayUnavailable(
    message = 'The SQL query engine is unavailable.',
  ): QueryPortError {
    return new QueryPortError(QueryPortErrorCode.GATEWAY_UNAVAILABLE, message);
  }

  /** Narrows an unknown value to this error, optionally to specific codes. */
  public static is(
    error: unknown,
    ...codes: readonly QueryPortErrorCode[]
  ): error is QueryPortError {
    return error instanceof QueryPortError && (codes.length === 0 || codes.includes(error.code));
  }
}
