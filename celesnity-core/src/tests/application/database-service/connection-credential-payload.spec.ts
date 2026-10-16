import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';

describe('PlaintextCredentialPayload', () => {
  it('keeps the value available to an adapter while redacting JSON and string output', () => {
    const credential = PlaintextCredentialPayload.create(1, 's3cr3t');

    expect(credential.schemaVersion).toBe(1);
    expect(credential.value).toBe('s3cr3t');
    expect(JSON.stringify(credential)).toBe('"[REDACTED]"');
    expect(String(credential)).toBe('[REDACTED]');
  });

  it.each([
    [0, 'secret'],
    [-1, 'secret'],
    [1.5, 'secret'],
    [1, ''],
  ])('rejects an invalid credential payload (%p, %p)', (schemaVersion, value) => {
    expect(() => PlaintextCredentialPayload.create(schemaVersion, value)).toThrow(ConnectionError);
  });
});

describe('ExecutionConnectionDescriptor', () => {
  it('redacts every secret option when serialized', () => {
    const descriptor = ExecutionConnectionDescriptor.create({
      driverClass: 'org.example.Driver',
      jdbcUrl: 'jdbc:example://db.internal/analytics',
      publicOptions: { DB_HOST: 'db.internal' },
      secretOptions: { DB_PASSWORD: 's3cr3t' },
    });

    expect(descriptor.driverClass).toBe('org.example.Driver');
    expect(descriptor.jdbcUrl).toBe('jdbc:example://db.internal/analytics');
    expect(JSON.stringify(descriptor)).toContain('"DB_PASSWORD":"[REDACTED]"');
    expect(JSON.stringify(descriptor)).not.toContain('s3cr3t');
  });
});
