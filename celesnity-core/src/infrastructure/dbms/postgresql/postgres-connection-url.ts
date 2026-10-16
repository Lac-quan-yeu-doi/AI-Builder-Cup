import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionEndpoint } from '@domain/database-service/value-objects/connection-value-objects';
import { PostgresConnectionMessage } from '@infrastructure/dbms/postgresql/postgres-connection.messages';
import {
  PostgresConnectionOptions,
  PostgresDatabaseName,
  PostgresDatabaseUsername,
  PostgresSslMode,
} from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';
import { PostgresPassword } from '@infrastructure/dbms/postgresql/postgres-password';

export const DEFAULT_POSTGRES_PORT = 5432;

const ALLOWED_OPTIONS = new Set(['application_name', 'sslmode']);

/** Parsed and validated PostgreSQL URL input for the PostgreSQL config codec. */
export class PostgresConnectionUrl {
  private constructor(
    public readonly endpoint: ConnectionEndpoint,
    public readonly databaseName: PostgresDatabaseName,
    public readonly username: PostgresDatabaseUsername,
    public readonly password: PostgresPassword | undefined,
    public readonly sslMode: PostgresSslMode,
    public readonly options: PostgresConnectionOptions,
  ) {}

  public static parse(connectionUrl: string): PostgresConnectionUrl {
    const url = PostgresConnectionUrl.asUrl(connectionUrl);
    PostgresConnectionUrl.assertSupportedScheme(url);
    PostgresConnectionUrl.assertNoFragment(url);
    PostgresConnectionUrl.assertSupportedOptions(url);

    return new PostgresConnectionUrl(
      ConnectionEndpoint.create(
        url.hostname,
        url.port === '' ? DEFAULT_POSTGRES_PORT : Number(url.port),
      ),
      PostgresDatabaseName.create(
        decodePart(PostgresConnectionUrl.singleDatabase(url), 'database name'),
      ),
      PostgresDatabaseUsername.create(decodePart(url.username, 'username')),
      url.password === ''
        ? undefined
        : PostgresPassword.create(decodePart(url.password, 'password')),
      PostgresSslMode.create(url.searchParams.get('sslmode') ?? 'disable'),
      PostgresConnectionOptions.create({
        applicationName: url.searchParams.get('application_name') ?? undefined,
      }),
    );
  }

  private static asUrl(connectionUrl: string): URL {
    try {
      return new URL(connectionUrl);
    } catch {
      throw ConnectionError.validation(PostgresConnectionMessage.urlMalformed);
    }
  }

  private static assertSupportedScheme(url: URL): void {
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw ConnectionError.validation(PostgresConnectionMessage.urlSchemeUnsupported);
    }
  }

  private static assertNoFragment(url: URL): void {
    if (url.hash !== '') {
      throw ConnectionError.validation(PostgresConnectionMessage.urlFragmentUnsupported);
    }
  }

  private static assertSupportedOptions(url: URL): void {
    for (const key of url.searchParams.keys()) {
      if (!ALLOWED_OPTIONS.has(key)) {
        throw ConnectionError.validation(PostgresConnectionMessage.urlOptionUnsupported(key));
      }
      if (url.searchParams.getAll(key).length > 1) {
        throw ConnectionError.validation(PostgresConnectionMessage.urlOptionRepeated(key));
      }
    }
  }

  private static singleDatabase(url: URL): string {
    const raw = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    if (raw.includes('/')) {
      throw ConnectionError.validation(PostgresConnectionMessage.urlMultipleDatabases);
    }
    return raw;
  }
}

function decodePart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw ConnectionError.validation(PostgresConnectionMessage.urlPartNotEncoded(label));
  }
}
