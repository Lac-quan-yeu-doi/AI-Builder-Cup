/**
 * Request headers carrying the Trino client identity.
 *
 * Shared by the Catalog Exploration and Query Workbench adapters. They keep
 * separate statement clients on purpose — each maps failures into its own bounded
 * context's error type — but how a caller identifies itself to Trino is a property
 * of the protocol rather than of either context, so it is stated once here.
 */

/** Credentials for the Trino HTTP protocol. An absent password means send none. */
export interface TrinoCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * Builds the identity headers for a Trino request.
 *
 * `X-Trino-User` is always sent: Trino uses it as the session user, and it is the
 * only identity an unauthenticated coordinator has.
 *
 * `Authorization` is added only when a password is configured. That conditional is
 * the point of this function rather than an optimisation — an unauthenticated
 * coordinator rejects a Basic header outright, so always sending one would break
 * local development, while never sending one fails every request against a
 * coordinator with password authentication enabled.
 *
 * The username appears in both headers, which is correct: Trino authenticates the
 * Basic credential and then requires the session user to match the authenticated
 * principal, so a mismatch is refused rather than silently preferring one.
 */
export function trinoIdentityHeaders(credentials: TrinoCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Trino-User': credentials.user,
  };

  if (credentials.password !== '') {
    // Basic auth is `base64(user:password)`. Buffer rather than btoa: the password
    // is arbitrary bytes from a secret store, and btoa throws on anything outside
    // Latin-1 — a failure that would look like a malformed request.
    const encoded = Buffer.from(`${credentials.user}:${credentials.password}`, 'utf8').toString(
      'base64',
    );
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
}
