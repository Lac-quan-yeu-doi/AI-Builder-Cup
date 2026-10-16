import type { ConnectionProbeInput } from '@application/database-service/interfaces/i-connection-probe';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlConnectionProbe } from '@infrastructure/dbms/mysql/mysql-connection.probe';

const codec = new MysqlConfigCodec();
const probe = new MysqlConnectionProbe(codec, {
  timeoutMilliseconds: 5_000,
});

function testConnection(
  port: number,
  sslMode: string,
  host = 'localhost',
  password = 'mysql-test-only',
): Promise<Awaited<ReturnType<MysqlConnectionProbe['test']>>> {
  const normalized = codec.normalize({
    host,
    port,
    databaseName: 'analytics',
    username: 'celesnity_reader',
    password,
    sslMode,
  });
  const input: ConnectionProbeInput = {
    config: normalized.config,
    resolvedAddresses: ['127.0.0.1'],
    credential: normalized.credential ?? PlaintextCredentialPayload.create(1, password),
  };
  return probe.test(input);
}

describe('MySQL 8 integration matrix', () => {
  it.each(['DISABLED', 'PREFERRED'])(
    '%s succeeds against a TLS-disabled server',
    async (sslMode) => {
      await expect(testConnection(13306, sslMode)).resolves.toMatchObject({
        status: VerificationStatusValue.SUCCEEDED,
      });
    },
  );

  it.each(['REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'])(
    '%s succeeds against the trusted TLS server',
    async (sslMode) => {
      await expect(testConnection(13307, sslMode)).resolves.toMatchObject({
        status: VerificationStatusValue.SUCCEEDED,
      });
    },
  );

  it('VERIFY_IDENTITY rejects a hostname mismatch', async () => {
    const result = await testConnection(13307, 'VERIFY_IDENTITY', 'wrong.test');

    expect(result).toMatchObject({
      status: VerificationStatusValue.FAILED,
      failureReason: 'MySQL TLS certificate verification failed.',
    });
  });

  it('VERIFY_CA rejects a different private CA', async () => {
    const result = await testConnection(13308, 'VERIFY_CA');

    expect(result).toMatchObject({
      status: VerificationStatusValue.FAILED,
      failureReason: 'MySQL TLS certificate verification failed.',
    });
  });

  it.each(['REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY'])(
    '%s fails safely against a TLS-disabled server',
    async (sslMode) => {
      await expect(testConnection(13306, sslMode)).resolves.toMatchObject({
        status: VerificationStatusValue.FAILED,
      });
    },
  );

  it('does not expose wrong credentials in a serialized failure', async () => {
    const result = await testConnection(13306, 'DISABLED', 'localhost', 'wrong-secret');

    expect(result).toMatchObject({
      status: VerificationStatusValue.FAILED,
      failureReason: 'MySQL rejected the supplied username or password.',
    });
    expect(JSON.stringify(result)).not.toContain('wrong-secret');
  });
});
