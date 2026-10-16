/**
 * Domain errors for the Catalog Exploration context.
 *
 * This context is an anti-corruption layer over Trino. Catalog reads and the
 * explicitly supported namespace creation command share a single error type with a
 * discriminating {@link CatalogErrorCode} rather than a separate class per
 * variant; messages stay generic so Trino internals are never leaked to callers
 * (Requirement 4.5), and the HTTP adapter maps each code to a sanitized status.
 */

/**
 * Classifies a catalog failure. The HTTP adapter maps each code to a status:
 * - `VALIDATION` -> 400: an identifier failed strict validation.
 * - `CONFLICT` -> 409: the requested catalog resource already exists.
 * - `UNAVAILABLE` -> 503: Trino is unreachable (network failure, timeout, transport).
 * - `QUERY` -> 502: Trino rejected the statement; its error text is discarded.
 */
export enum CatalogErrorCode {
  VALIDATION = 'VALIDATION',
  CONFLICT = 'CONFLICT',
  NOT_FOUND = 'NOT_FOUND',
  UNAVAILABLE = 'UNAVAILABLE',
  QUERY = 'QUERY',
}

/**
 * The single error raised by the Catalog Exploration context. Every message is
 * safe to surface: it only names which identifier was rejected or gives a
 * generic reason, and never echoes unsafe input or leaks Trino internals.
 *
 * Prefer the static factories over the constructor at call sites.
 */
export class CatalogError extends Error {
  public readonly code: CatalogErrorCode;

  public constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
  }

  /** A catalog/namespace/table/column identifier failed strict validation. */
  public static validation(message: string): CatalogError {
    return new CatalogError(CatalogErrorCode.VALIDATION, message);
  }

  /** Trino could not be reached (network failure, timeout, or transport status). */
  public static unavailable(): CatalogError {
    return new CatalogError(
      CatalogErrorCode.UNAVAILABLE,
      'The catalog service is temporarily unavailable.',
    );
  }

  public static conflict(message: string): CatalogError {
    return new CatalogError(CatalogErrorCode.CONFLICT, message);
  }

  public static notFound(message: string): CatalogError {
    return new CatalogError(CatalogErrorCode.NOT_FOUND, message);
  }

  /** Trino accepted the request but rejected the statement. */
  public static query(): CatalogError {
    return new CatalogError(CatalogErrorCode.QUERY, 'The catalog query could not be completed.');
  }
}
