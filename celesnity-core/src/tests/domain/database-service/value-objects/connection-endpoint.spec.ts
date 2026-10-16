import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionEndpoint } from '@domain/database-service/value-objects/connection-value-objects';

describe('ConnectionEndpoint', () => {
  it('normalizes host names and unwraps bracketed IPv6 addresses', () => {
    const hostname = ConnectionEndpoint.create('DB.INTERNAL', 5432);
    const ipv6 = ConnectionEndpoint.create('[::1]', 5432);

    expect(hostname.host).toBe('db.internal');
    expect(hostname.port).toBe(5432);
    expect(ipv6.host).toBe('::1');
  });

  it.each([
    ['', 5432],
    ['db.internal/path', 5432],
    ['db.internal', 0],
    ['db.internal', 65_536],
    ['db.internal', 5432.5],
  ])('rejects an invalid endpoint (%p, %p)', (host, port) => {
    expect(() => ConnectionEndpoint.create(host, port)).toThrow(ConnectionError);
  });
});
