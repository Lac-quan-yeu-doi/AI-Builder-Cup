import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';

const codec = new PostgresConfigCodec();

describe('PostgresConfigCodec', () => {
  it('normalizes structured details into generic config, destination, and opaque credentials', () => {
    const result = codec.normalize({
      host: 'DB.Internal',
      port: 6432,
      databaseName: ' analytics ',
      username: ' alice ',
      password: 's3cr3t',
      sslMode: 'REQUIRE',
      options: { applicationName: 'celesnity' },
    });

    expect(result.config.schemaVersion).toBe(1);
    expect(result.config.toRecord()).toEqual({
      databaseName: 'analytics',
      host: 'db.internal',
      options: { applicationName: 'celesnity' },
      port: 6432,
      sslMode: 'require',
      username: 'alice',
    });
    expect(result.config.toRecord()).not.toHaveProperty('password');
    expect(result.destination).toEqual({
      host: 'db.internal',
      port: 6432,
      engineLabel: 'PostgreSQL',
    });
    expect(result.credential?.schemaVersion).toBe(1);
    expect(result.credential?.value).toBe('s3cr3t');
  });

  it('uses PostgreSQL defaults and merges omitted fields from existing generic config', () => {
    const existing = codec.normalize({
      host: 'existing.internal',
      port: 6000,
      databaseName: 'existing_db',
      username: 'existing_user',
      sslMode: 'require',
      options: { applicationName: 'existing-app' },
    }).config;

    const result = codec.normalize({ port: 7000 }, existing);

    expect(result.config.toRecord()).toEqual({
      databaseName: 'existing_db',
      host: 'existing.internal',
      options: { applicationName: 'existing-app' },
      port: 7000,
      sslMode: 'require',
      username: 'existing_user',
    });
    expect(result.credential).toBeUndefined();

    const defaults = codec.normalize({
      host: 'db.internal',
      databaseName: 'analytics',
      username: 'alice',
    });
    expect(defaults.config.toRecord()).toMatchObject({ port: 5432, sslMode: 'disable' });
  });

  it('normalizes URL details, including IPv6, percent encoding, and application_name', () => {
    const result = codec.normalize({
      connectionUrl:
        'postgresql://a%40b:p%40ss@[::1]:6432/my%20db?sslmode=verify-full&application_name=celesnity',
    });

    expect(result.config.toRecord()).toEqual({
      databaseName: 'my db',
      host: '::1',
      options: { applicationName: 'celesnity' },
      port: 6432,
      sslMode: 'verify-full',
      username: 'a@b',
    });
    expect(result.credential?.value).toBe('p@ss');
    expect(result.destination).toEqual({ host: '::1', port: 6432, engineLabel: 'PostgreSQL' });
  });

  it.each(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])(
    'preserves SSL mode %s',
    (sslMode) => {
      const result = codec.normalize({
        host: 'db.internal',
        databaseName: 'analytics',
        username: 'alice',
        sslMode,
      });

      expect(result.config.toRecord()).toHaveProperty('sslMode', sslMode);
    },
  );

  it('restores and revalidates a stored generic config', () => {
    const normalized = codec.normalize({
      host: 'db.internal',
      port: 6432,
      databaseName: 'analytics',
      username: 'alice',
      sslMode: 'require',
      options: { applicationName: 'celesnity' },
    });

    const restored = codec.restore(normalized.config);

    expect(restored.config.equals(normalized.config)).toBe(true);
    expect(restored.destination).toEqual(normalized.destination);
  });

  it('rejects unsupported stored schema versions before decoding fields', () => {
    const config = NormalizedConnectionConfig.create(2, { host: 'db.internal' });

    expect(() => codec.restore(config)).toThrow(
      'Connection configuration schema version must be a positive integer.',
    );
    expect(() => codec.restore(config)).toThrow(ConnectionError);
  });

  it.each([
    ['not a url', 'Connection URL must be a valid PostgreSQL URL.'],
    ['mysql://alice@db.internal/analytics', 'Only PostgreSQL connection URLs are supported.'],
    [
      'postgresql://alice@db.internal/analytics?connect_timeout=5',
      'Unsupported PostgreSQL URL option: connect_timeout.',
    ],
    [
      'postgresql://alice@db.internal/analytics?sslmode=require&sslmode=disable',
      'PostgreSQL URL option sslmode must be specified once.',
    ],
  ])('preserves URL validation for %s', (connectionUrl, message) => {
    expect(() => codec.normalize({ connectionUrl })).toThrow(message);
  });

  it('rejects a URL mixed with structured fields', () => {
    expect(() =>
      codec.normalize({
        connectionUrl: 'postgresql://alice@db.internal/analytics',
        host: 'other.internal',
      }),
    ).toThrow('Submit either a PostgreSQL URL or structured connection fields, not both.');
  });
});
