import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';

const DBMS_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/u;

/** A normalized identifier whose support is determined by the plugin registry. */
export class ConnectorType {
  private constructor(public readonly value: string) {}

  public static create(value: string): ConnectorType {
    const normalized = value.trim().toUpperCase();
    if (normalized.length === 0) {
      throw ConnectionError.validation(ConnectionMessage.connectorTypeRequired);
    }
    if (!DBMS_TYPE_PATTERN.test(normalized)) {
      throw ConnectionError.validation(ConnectionMessage.connectorTypeInvalid);
    }
    return new ConnectorType(normalized);
  }

  public equals(other: ConnectorType): boolean {
    return this.value === other.value;
  }
}
