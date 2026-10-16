import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlExecutionAdapter } from '@infrastructure/dbms/mysql/mysql-execution.adapter';

const codec = new MysqlConfigCodec();
const adapter = new MysqlExecutionAdapter(codec);

describe('MysqlExecutionAdapter', () => {
  it('builds a redacted Connector/J descriptor with MySQL-only aliases', () => {
    const config = codec.normalize({
      host: 'db.internal',
      port: 3307,
      databaseName: 'analytics',
      username: 'reader',
      password: 'not-stored-here',
      sslMode: 'VERIFY_IDENTITY',
    }).config;

    const descriptor = adapter.build(config, PlaintextCredentialPayload.create(1, 's3cr3t'));

    expect(descriptor.driverClass).toBe('com.mysql.cj.jdbc.Driver');
    expect(descriptor.jdbcUrl).toBe(
      'jdbc:mysql://db.internal:3307/analytics?sslMode=VERIFY_IDENTITY',
    );
    expect(descriptor.publicOptions).toMatchObject({
      SOURCE_MYSQL_URL: descriptor.jdbcUrl,
      SOURCE_MYSQL_USER: 'reader',
      MYSQL_URL: descriptor.jdbcUrl,
      MYSQL_USER: 'reader',
      CELESNITY_DB_SSLMODE: 'VERIFY_IDENTITY',
    });
    expect(descriptor.secretOptions).toEqual({
      SOURCE_MYSQL_PASSWORD: 's3cr3t',
      MYSQL_PASSWORD: 's3cr3t',
    });
    expect(descriptor.publicOptions).not.toHaveProperty('POSTGRES_URL');
    expect(JSON.stringify(descriptor)).not.toContain('s3cr3t');
  });

  it('preserves IPv6 brackets and database-name encoding in the JDBC URL', () => {
    const config = codec.normalize({
      host: '::1',
      port: 3306,
      databaseName: 'my db//x',
      username: 'reader',
      sslMode: 'DISABLED',
    }).config;

    expect(adapter.build(config, PlaintextCredentialPayload.create(1, 'secret')).jdbcUrl).toBe(
      'jdbc:mysql://[::1]:3306/my%20db%2F%2Fx?sslMode=DISABLED',
    );
  });

  it.each(['DISABLED', 'PREFERRED', 'REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'])(
    'preserves Connector/J TLS mode spelling %s',
    (sslMode) => {
      const config = codec.normalize({
        host: 'db.internal',
        databaseName: 'analytics',
        username: 'reader',
        sslMode,
      }).config;

      expect(
        adapter.build(config, PlaintextCredentialPayload.create(1, 'secret')).jdbcUrl,
      ).toContain(`sslMode=${sslMode}`);
    },
  );

  it('rejects a credential encoded with another schema version', () => {
    const config = codec.normalize({
      host: 'db.internal',
      databaseName: 'analytics',
      username: 'reader',
    }).config;

    expect(() => adapter.build(config, PlaintextCredentialPayload.create(2, 'secret'))).toThrow(
      ConnectionError,
    );
    expect(() => adapter.build(config, PlaintextCredentialPayload.create(2, 'secret'))).toThrow(
      'Connection credential payload is invalid.',
    );
  });
});
