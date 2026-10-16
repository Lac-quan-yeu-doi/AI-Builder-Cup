import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import {
  DEFAULT_MYSQL_PORT,
  MysqlConnectionUrl,
} from '@infrastructure/dbms/mysql/mysql-connection-url';
import { MysqlSslModeValue } from '@infrastructure/dbms/mysql/mysql-connection.value-objects';

describe('MysqlConnectionUrl', () => {
  it('parses a credential-bearing IPv6 URL and decodes its parts', () => {
    const parsed = MysqlConnectionUrl.parse(
      'mysql://a%40b:p%40ss@[::1]:3307/my%20db?sslMode=VERIFY_IDENTITY',
    );

    expect(parsed.endpoint.host).toBe('::1');
    expect(parsed.endpoint.port).toBe(3307);
    expect(parsed.databaseName.value).toBe('my db');
    expect(parsed.username.value).toBe('a@b');
    expect(parsed.password?.value).toBe('p@ss');
    expect(parsed.sslMode.value).toBe(MysqlSslModeValue.VERIFY_IDENTITY);
    expect(JSON.stringify(parsed.password)).not.toContain('p@ss');
  });

  it('uses the MySQL default port and disabled TLS mode', () => {
    const parsed = MysqlConnectionUrl.parse('mysql://alice:secret@db.internal/analytics');

    expect(parsed.endpoint.port).toBe(DEFAULT_MYSQL_PORT);
    expect(parsed.sslMode.value).toBe(MysqlSslModeValue.DISABLED);
  });

  it.each([
    'postgresql://alice@db.internal/analytics',
    'jdbc:mysql://db.internal/analytics',
    'mysqlx://alice@db.internal/analytics',
    'mariadb://alice@db.internal/analytics',
  ])('rejects unsupported URL %s', (connectionUrl) => {
    expect(() => MysqlConnectionUrl.parse(connectionUrl)).toThrow(
      'Only MySQL connection URLs are supported.',
    );
  });

  it('rejects malformed URL text', () => {
    expect(() => MysqlConnectionUrl.parse('not a url')).toThrow(
      'Connection URL must be a valid MySQL URL.',
    );
  });

  it('rejects URL fragments and unsupported query parameters', () => {
    expect(() => MysqlConnectionUrl.parse('mysql://alice@db.internal/analytics#fragment')).toThrow(
      'Connection URL fragments are not supported.',
    );
    expect(() =>
      MysqlConnectionUrl.parse('mysql://alice@db.internal/analytics?allowPublicKeyRetrieval=true'),
    ).toThrow('Unsupported MySQL URL option: allowPublicKeyRetrieval.');
  });

  it('rejects repeated TLS options and multiple database path segments', () => {
    expect(() =>
      MysqlConnectionUrl.parse(
        'mysql://alice@db.internal/analytics?sslMode=REQUIRED&sslMode=DISABLED',
      ),
    ).toThrow('MySQL URL option sslMode must be specified once.');
    expect(() => MysqlConnectionUrl.parse('mysql://alice@db.internal/a/b')).toThrow(
      'Connection URL must identify exactly one database.',
    );
  });

  it('reports malformed percent-encoded URL parts as validation errors', () => {
    expect(() => MysqlConnectionUrl.parse('mysql://alice%ZZ@db.internal/analytics')).toThrow(
      'Connection URL username is not correctly encoded.',
    );
    expect(() =>
      MysqlConnectionUrl.parse('mysql://alice:secret@db.internal/analytics'),
    ).not.toThrow(ConnectionError);
  });
});
