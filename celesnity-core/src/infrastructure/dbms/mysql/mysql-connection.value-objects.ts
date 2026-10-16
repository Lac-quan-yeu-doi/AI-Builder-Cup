import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { MysqlConnectionMessage } from '@infrastructure/dbms/mysql/mysql-connection.messages';

/** Connector/J's five explicit TLS policies. */
export enum MysqlSslModeValue {
  DISABLED = 'DISABLED',
  PREFERRED = 'PREFERRED',
  REQUIRED = 'REQUIRED',
  VERIFY_CA = 'VERIFY_CA',
  VERIFY_IDENTITY = 'VERIFY_IDENTITY',
}

export function isMysqlSslModeValue(value: string): value is MysqlSslModeValue {
  return Object.values<string>(MysqlSslModeValue).includes(value);
}

const text = TextGuard.reporting((message) => ConnectionError.validation(message));

export class MysqlDatabaseName {
  private constructor(public readonly value: string) {}

  public static create(value: string): MysqlDatabaseName {
    return new MysqlDatabaseName(text.required('Database name', value, 255));
  }

  public equals(other: MysqlDatabaseName): boolean {
    return this.value === other.value;
  }
}

export class MysqlDatabaseUsername {
  private constructor(public readonly value: string) {}

  public static create(value: string): MysqlDatabaseUsername {
    return new MysqlDatabaseUsername(text.required('Database username', value, 255));
  }

  public equals(other: MysqlDatabaseUsername): boolean {
    return this.value === other.value;
  }
}

export class MysqlSslMode {
  private constructor(public readonly value: MysqlSslModeValue) {}

  public static create(value: string): MysqlSslMode {
    const normalized = value.trim().toUpperCase().replaceAll('-', '_');
    if (!isMysqlSslModeValue(normalized)) {
      throw ConnectionError.validation(
        MysqlConnectionMessage.sslModeUnsupported(Object.values(MysqlSslModeValue)),
      );
    }
    return new MysqlSslMode(normalized);
  }

  public equals(other: MysqlSslMode): boolean {
    return this.value === other.value;
  }
}
