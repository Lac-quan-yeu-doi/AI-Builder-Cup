import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';

const codec = new MysqlConfigCodec();

describe('MysqlConfigCodec', () => {
  it('normalizes structured details into generic config, destination, and opaque credentials', () => {
    const result = codec.normalize({
      host: 'DB.Internal',
      port: 3307,
      databaseName: ' analytics ',
      username: ' alice ',
      password: 's3cr3t',
      sslMode: 'required',
    });

    expect(result.config.schemaVersion).toBe(1);
    expect(result.config.toRecord()).toEqual({
      databaseName: 'analytics',
      host: 'db.internal',
      port: 3307,
      sslMode: 'REQUIRED',
      username: 'alice',
    });
    expect(result.config.toRecord()).not.toHaveProperty('password');
    expect(result.destination).toEqual({
      host: 'db.internal',
      port: 3307,
      engineLabel: 'MySQL',
    });
    expect(result.credential?.schemaVersion).toBe(1);
    expect(result.credential?.value).toBe('s3cr3t');
  });

  it('uses MySQL defaults and merges omitted fields from existing generic config', () => {
    const existing = codec.normalize({
      host: 'existing.internal',
      port: 3308,
      databaseName: 'existing_db',
      username: 'existing_user',
      sslMode: 'verify-ca',
    }).config;

    const result = codec.normalize({ port: 3309 }, existing);

    expect(result.config.toRecord()).toEqual({
      databaseName: 'existing_db',
      host: 'existing.internal',
      port: 3309,
      sslMode: 'VERIFY_CA',
      username: 'existing_user',
    });
    expect(result.credential).toBeUndefined();

    const defaults = codec.normalize({
      host: 'db.internal',
      databaseName: 'analytics',
      username: 'alice',
    });
    expect(defaults.config.toRecord()).toMatchObject({ port: 3306, sslMode: 'DISABLED' });
  });

  it('normalizes URL details, including IPv6 and percent encoding', () => {
    const result = codec.normalize({
      connectionUrl: 'mysql://a%40b:p%40ss@[::1]:3307/my%20db?sslMode=VERIFY_IDENTITY',
    });

    expect(result.config.toRecord()).toEqual({
      databaseName: 'my db',
      host: '::1',
      port: 3307,
      sslMode: 'VERIFY_IDENTITY',
      username: 'a@b',
    });
    expect(result.credential?.value).toBe('p@ss');
    expect(result.destination).toEqual({ host: '::1', port: 3307, engineLabel: 'MySQL' });
  });

  it.each(['disabled', 'preferred', 'required', 'verify-ca', 'verify-identity'])(
    'preserves SSL mode %s',
    (sslMode) => {
      const result = codec.normalize({
        host: 'db.internal',
        databaseName: 'analytics',
        username: 'alice',
        sslMode,
      });

      expect(result.config.toRecord()).toHaveProperty(
        'sslMode',
        sslMode.toUpperCase().replace('-', '_'),
      );
    },
  );

  it('restores and revalidates a stored generic config', () => {
    const normalized = codec.normalize({
      host: 'db.internal',
      port: 3307,
      databaseName: 'analytics',
      username: 'alice',
      sslMode: 'required',
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
    ['not a url', 'Connection URL must be a valid MySQL URL.'],
    ['postgresql://alice@db.internal/analytics', 'Only MySQL connection URLs are supported.'],
    [
      'mysql://alice@db.internal/analytics?allowPublicKeyRetrieval=true',
      'Unsupported MySQL URL option: allowPublicKeyRetrieval.',
    ],
    [
      'mysql://alice@db.internal/analytics?sslMode=REQUIRED&sslMode=DISABLED',
      'MySQL URL option sslMode must be specified once.',
    ],
  ])('preserves URL validation for %s', (connectionUrl, message) => {
    expect(() => codec.normalize({ connectionUrl })).toThrow(message);
  });

  it('rejects a URL mixed with structured fields', () => {
    expect(() =>
      codec.normalize({
        connectionUrl: 'mysql://alice@db.internal/analytics',
        host: 'other.internal',
      }),
    ).toThrow('Submit either a MySQL URL or structured connection fields, not both.');
  });

  it('rejects unsupported input fields instead of silently forwarding driver options', () => {
    expect(() =>
      codec.normalize({
        host: 'db.internal',
        databaseName: 'analytics',
        username: 'alice',
        options: { allowPublicKeyRetrieval: true },
      }),
    ).toThrow('Unsupported MySQL connection field: options.');

    expect(() =>
      codec.normalize({
        host: 'db.internal',
        databaseName: 'analytics',
        username: 'alice',
        driverOption: 'unsafe',
      }),
    ).toThrow('Unsupported MySQL connection field: driverOption.');
  });

  it('rejects unknown fields in stored canonical configuration', () => {
    const malformed = NormalizedConnectionConfig.create(1, {
      databaseName: 'analytics',
      host: 'db.internal',
      port: 3306,
      sslMode: 'DISABLED',
      username: 'alice',
      unsafeOption: true,
    });

    expect(() => codec.restore(malformed)).toThrow(
      'Unsupported MySQL connection field: unsafeOption.',
    );
  });
});
