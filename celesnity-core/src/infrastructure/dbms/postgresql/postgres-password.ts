import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { PostgresConnectionMessage } from '@infrastructure/dbms/postgresql/postgres-connection.messages';

/** PostgreSQL accepts long passwords; this bound rejects absurd input. */
const MAXIMUM_LENGTH = 4096;

/**
 * PostgreSQL password validation and secret-safe rendering.
 *
 * Password whitespace is significant to the database server, so this value is
 * deliberately not trimmed.
 */
export class PostgresPassword {
  private constructor(public readonly value: string) {}

  public static create(value: string): PostgresPassword {
    if (value.length === 0) {
      throw ConnectionError.validation(PostgresConnectionMessage.passwordEmpty);
    }
    if (value.length > MAXIMUM_LENGTH) {
      throw ConnectionError.validation(PostgresConnectionMessage.passwordTooLong(MAXIMUM_LENGTH));
    }
    if (value.includes('\0')) {
      throw ConnectionError.validation(PostgresConnectionMessage.passwordInvalidCharacter);
    }
    return new PostgresPassword(value);
  }

  public static createOptional(value: string | undefined): PostgresPassword | undefined {
    return value === undefined ? undefined : PostgresPassword.create(value);
  }

  public toJSON(): string {
    return '[REDACTED]';
  }

  public toString(): string {
    return '[REDACTED]';
  }
}
