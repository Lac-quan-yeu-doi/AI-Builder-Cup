import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';

describe('ExecutionConnectionDescriptor', () => {
  it('carries generic driver and JDBC details with separated options', () => {
    const descriptor = ExecutionConnectionDescriptor.create({
      driverClass: 'example.TestDriver',
      jdbcUrl: 'jdbc:test://db.internal/analytics',
      publicOptions: { DB_HOST: 'db.internal' },
      secretOptions: { DB_PASSWORD: 's3cr3t' },
    });

    expect(descriptor.driverClass).toBe('example.TestDriver');
    expect(descriptor.jdbcUrl).toBe('jdbc:test://db.internal/analytics');
    expect(descriptor.publicOptions).toEqual({ DB_HOST: 'db.internal' });
    expect(descriptor.secretOptions).toEqual({ DB_PASSWORD: 's3cr3t' });
  });

  it('redacts secret options in nested serialization', () => {
    const descriptor = ExecutionConnectionDescriptor.create({
      driverClass: 'example.TestDriver',
      jdbcUrl: 'jdbc:test://db.internal/analytics',
      publicOptions: {},
      secretOptions: { DB_PASSWORD: 's3cr3t', TOKEN: 'token' },
    });

    const serialized = JSON.stringify({ context: { descriptor } });

    expect(serialized).not.toContain('s3cr3t');
    expect(serialized).not.toContain('token');
    expect(serialized).toContain('[REDACTED]');
  });
});
