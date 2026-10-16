/**
 * Reference to an active data connection, resolved for use by other contexts.
 */
export interface ActiveConnectionReference {
  readonly id: string;
}

/**
 * Port: resolves and validates that a connection id refers to an active
 * connection.
 */
export interface IConnectionReferenceProvider {
  requireActive(connectionId: string): Promise<ActiveConnectionReference>;
}
