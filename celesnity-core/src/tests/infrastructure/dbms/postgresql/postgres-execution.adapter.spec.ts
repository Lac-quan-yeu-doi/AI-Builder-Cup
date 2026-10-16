import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresExecutionAdapter } from '@infrastructure/dbms/postgresql/postgres-execution.adapter';

const codec = new PostgresConfigCodec();
const adapter = new PostgresExecutionAdapter(codec);

describe('PostgresExecutionAdapter', () => {
  it('builds a credential-free JDBC descriptor with legacy environment aliases', () => {
    const config = codec.normalize({
      host: 'db.internal',
      port: 6432,
      databaseName: 'analytics',
      username: 'alice',
      sslMode: 'require',
    }).config;

    const descriptor = adapter.build(config, PlaintextCredentialPayload.create(1, 's3cr3t'));

    expect(descriptor.driverClass).toBe('org.postgresql.Driver');
    expect(descriptor.jdbcUrl).toBe('jdbc:postgresql://db.internal:6432/analytics?sslmode=require');
    expect(descriptor.publicOptions).toMatchObject({
      SOURCE_POSTGRES_URL: descriptor.jdbcUrl,
      SOURCE_POSTGRES_USER: 'alice',
      POSTGRES_URL: descriptor.jdbcUrl,
      POSTGRES_USER: 'alice',
      CELESNITY_DB_HOST: 'db.internal',
      CELESNITY_DB_PORT: '6432',
      CELESNITY_DB_NAME: 'analytics',
      CELESNITY_DB_SSLMODE: 'require',
      CELESNITY_DB_JDBC_URL: descriptor.jdbcUrl,
    });
    expect(descriptor.secretOptions).toEqual({
      SOURCE_POSTGRES_PASSWORD: 's3cr3t',
      POSTGRES_PASSWORD: 's3cr3t',
    });
    expect(JSON.stringify(descriptor)).not.toContain('s3cr3t');
  });

  it('preserves IPv6 and database-name encoding in the JDBC URL', () => {
    const config = codec.normalize({
      host: '::1',
      port: 5432,
      databaseName: 'my db//x',
      username: 'alice',
      sslMode: 'verify-full',
    }).config;

    expect(adapter.build(config, PlaintextCredentialPayload.create(1, 'secret')).jdbcUrl).toBe(
      'jdbc:postgresql://[::1]:5432/my%20db%2F%2Fx?sslmode=verify-full',
    );
  });
});
