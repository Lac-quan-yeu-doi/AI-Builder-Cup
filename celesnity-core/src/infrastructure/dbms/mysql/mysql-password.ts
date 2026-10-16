import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { MysqlConnectionMessage } from '@infrastructure/dbms/mysql/mysql-connection.messages';

/** MySQL password validation and secret-safe rendering. */
const MAXIMUM_LENGTH = 4096;

export class MysqlPassword {
  private constructor(public readonly value: string) {}

  public static create(value: string): MysqlPassword {
    if (value.length === 0) {
      throw ConnectionError.validation(MysqlConnectionMessage.passwordEmpty);
    }
    if (value.length > MAXIMUM_LENGTH) {
      throw ConnectionError.validation(MysqlConnectionMessage.passwordTooLong(MAXIMUM_LENGTH));
    }
    if (value.includes('\0')) {
      throw ConnectionError.validation(MysqlConnectionMessage.passwordInvalidCharacter);
    }
    return new MysqlPassword(value);
  }

  public static createOptional(value: string | undefined): MysqlPassword | undefined {
    return value === undefined ? undefined : MysqlPassword.create(value);
  }

  public toJSON(): string {
    return '[REDACTED]';
  }

  public toString(): string {
    return '[REDACTED]';
  }
}
