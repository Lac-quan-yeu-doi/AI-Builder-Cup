import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

/**
 * Plaintext credentials are deliberately short-lived and opaque to the generic
 * registry. Adapters can interpret the value, while logs and serialization cannot.
 */
export class PlaintextCredentialPayload {
  private constructor(
    public readonly schemaVersion: number,
    public readonly value: string,
  ) {}

  public static create(schemaVersion: number, value: string): PlaintextCredentialPayload {
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || value.length === 0) {
      throw ConnectionError.validation(ConnectionMessage.credentialPayloadInvalid);
    }
    return new PlaintextCredentialPayload(schemaVersion, value);
  }

  public toJSON(): string {
    return '[REDACTED]';
  }

  public toString(): string {
    return '[REDACTED]';
  }
}
