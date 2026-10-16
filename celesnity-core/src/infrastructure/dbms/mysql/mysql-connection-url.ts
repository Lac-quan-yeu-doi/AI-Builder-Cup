import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionEndpoint } from '@domain/database-service/value-objects/connection-value-objects';
import { MysqlConnectionMessage } from '@infrastructure/dbms/mysql/mysql-connection.messages';
import {
  MysqlDatabaseName,
  MysqlDatabaseUsername,
  MysqlSslMode,
} from '@infrastructure/dbms/mysql/mysql-connection.value-objects';
import { MysqlPassword } from '@infrastructure/dbms/mysql/mysql-password';

export const DEFAULT_MYSQL_PORT = 3306;

const ALLOWED_OPTIONS = new Set(['sslMode']);

/** Parsed and validated MySQL URL input. */
export class MysqlConnectionUrl {
  private constructor(
    public readonly endpoint: ConnectionEndpoint,
    public readonly databaseName: MysqlDatabaseName,
    public readonly username: MysqlDatabaseUsername,
    public readonly password: MysqlPassword | undefined,
    public readonly sslMode: MysqlSslMode,
  ) {}

  public static parse(connectionUrl: string): MysqlConnectionUrl {
    const url = MysqlConnectionUrl.asUrl(connectionUrl);
    if (url.protocol !== 'mysql:') {
      throw ConnectionError.validation(MysqlConnectionMessage.urlSchemeUnsupported);
    }
    if (url.hash !== '') {
      throw ConnectionError.validation(MysqlConnectionMessage.urlFragmentUnsupported);
    }
    MysqlConnectionUrl.assertSupportedOptions(url);

    return new MysqlConnectionUrl(
      ConnectionEndpoint.create(
        url.hostname,
        url.port === '' ? DEFAULT_MYSQL_PORT : Number(url.port),
      ),
      MysqlDatabaseName.create(decodePart(MysqlConnectionUrl.singleDatabase(url), 'database name')),
      MysqlDatabaseUsername.create(decodePart(url.username, 'username')),
      url.password === '' ? undefined : MysqlPassword.create(decodePart(url.password, 'password')),
      MysqlSslMode.create(url.searchParams.get('sslMode') ?? 'DISABLED'),
    );
  }

  private static asUrl(connectionUrl: string): URL {
    try {
      return new URL(connectionUrl);
    } catch {
      throw ConnectionError.validation(MysqlConnectionMessage.urlMalformed);
    }
  }

  private static assertSupportedOptions(url: URL): void {
    for (const key of url.searchParams.keys()) {
      if (!ALLOWED_OPTIONS.has(key)) {
        throw ConnectionError.validation(MysqlConnectionMessage.urlOptionUnsupported(key));
      }
      if (url.searchParams.getAll(key).length > 1) {
        throw ConnectionError.validation(MysqlConnectionMessage.urlOptionRepeated(key));
      }
    }
  }

  private static singleDatabase(url: URL): string {
    const raw = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    if (raw.includes('/')) {
      throw ConnectionError.validation(MysqlConnectionMessage.urlMultipleDatabases);
    }
    return raw;
  }
}

function decodePart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw ConnectionError.validation(MysqlConnectionMessage.urlPartNotEncoded(label));
  }
}
