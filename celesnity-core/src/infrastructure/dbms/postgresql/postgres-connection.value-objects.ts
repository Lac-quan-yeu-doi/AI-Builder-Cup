import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { TextGuard } from '@domain/shared/text-guard';
import { PostgresConnectionMessage } from '@infrastructure/dbms/postgresql/postgres-connection.messages';

/** The libpq SSL modes accepted by the PostgreSQL adapter. */
export enum PostgresSslModeValue {
  DISABLE = 'disable',
  PREFER = 'prefer',
  REQUIRE = 'require',
  VERIFY_CA = 'verify-ca',
  VERIFY_FULL = 'verify-full',
}

export function isPostgresSslModeValue(value: string): value is PostgresSslModeValue {
  return Object.values<string>(PostgresSslModeValue).includes(value);
}

const text = TextGuard.reporting((message) => ConnectionError.validation(message));

export class PostgresDatabaseName {
  private constructor(public readonly value: string) {}

  public static create(value: string): PostgresDatabaseName {
    return new PostgresDatabaseName(text.required('Database name', value, 255));
  }

  public equals(other: PostgresDatabaseName): boolean {
    return this.value === other.value;
  }
}

export class PostgresDatabaseUsername {
  private constructor(public readonly value: string) {}

  public static create(value: string): PostgresDatabaseUsername {
    return new PostgresDatabaseUsername(text.required('Database username', value, 255));
  }

  public equals(other: PostgresDatabaseUsername): boolean {
    return this.value === other.value;
  }
}

export class PostgresSslMode {
  private constructor(public readonly value: PostgresSslModeValue) {}

  public static create(value: string): PostgresSslMode {
    const normalized = value.trim().toLowerCase();
    if (!isPostgresSslModeValue(normalized)) {
      throw ConnectionError.validation(
        PostgresConnectionMessage.sslModeUnsupported(Object.values(PostgresSslModeValue)),
      );
    }
    return new PostgresSslMode(normalized);
  }

  public equals(other: PostgresSslMode): boolean {
    return this.value === other.value;
  }
}

export interface PostgresConnectionOptionsValue {
  readonly applicationName?: string;
}

export class PostgresConnectionOptions {
  private constructor(public readonly applicationName?: string) {}

  public static create(value: PostgresConnectionOptionsValue = {}): PostgresConnectionOptions {
    const applicationName = value.applicationName?.trim();
    if (applicationName !== undefined && applicationName.length > 63) {
      throw ConnectionError.validation(PostgresConnectionMessage.applicationNameTooLong);
    }
    if (applicationName?.includes('\0')) {
      throw ConnectionError.validation(PostgresConnectionMessage.applicationNameInvalidCharacter);
    }
    return new PostgresConnectionOptions(applicationName === '' ? undefined : applicationName);
  }

  public equals(other: PostgresConnectionOptions): boolean {
    return this.applicationName === other.applicationName;
  }

  public toRecord(): PostgresConnectionOptionsValue {
    return this.applicationName === undefined ? {} : { applicationName: this.applicationName };
  }
}
