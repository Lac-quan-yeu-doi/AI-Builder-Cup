import type { ConnectionOptions } from 'mysql2/promise';
import { PassThrough } from 'node:stream';

import type { ConnectionProbeInput } from '@application/database-service/interfaces/i-connection-probe';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import {
  MysqlConnectionProbe,
  type MysqlClient,
  type MysqlClientFactory,
} from '@infrastructure/dbms/mysql/mysql-connection.probe';

const FIXED_NOW = new Date('2026-08-06T00:00:00.000Z');
const codec = new MysqlConfigCodec();

class FakeMysqlClient implements MysqlClient {
  public readonly query = jest.fn<Promise<unknown>, [string]>();
  public readonly end = jest.fn<Promise<void>, []>();
}

function successfulClient(): FakeMysqlClient {
  const client = new FakeMysqlClient();
  client.query.mockResolvedValue([[], []]);
  client.end.mockResolvedValue(undefined);
  return client;
}

function input(sslMode = 'REQUIRED'): ConnectionProbeInput {
  const normalized = codec.normalize({
    host: 'db.internal',
    port: 3307,
    databaseName: 'analytics',
    username: 'alice',
    password: 's3cr3t',
    sslMode,
  });
  return {
    config: normalized.config,
    resolvedAddresses: ['10.0.0.1', '10.0.0.2'],
    credential: normalized.credential ?? PlaintextCredentialPayload.create(1, 's3cr3t'),
  };
}

function configuredProbe(
  createClient: MysqlClientFactory,
  openStream?: (address: string, port: number) => PassThrough,
): MysqlConnectionProbe {
  return new MysqlConnectionProbe(codec, {
    timeoutMilliseconds: 1_200,
    createClient,
    openStream,
    now: (): Date => FIXED_NOW,
  });
}

describe('MysqlConnectionProbe', () => {
  it('rejects a credential encoded with another schema version before connecting', async () => {
    const createClient = jest.fn<Promise<MysqlClient>, [ConnectionOptions]>();
    const incompatible = {
      ...input(),
      credential: PlaintextCredentialPayload.create(2, 's3cr3t'),
    };

    await expect(configuredProbe(createClient).test(incompatible)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Connection credential payload is invalid.',
      name: ConnectionError.name,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('decodes generic input, queries SELECT 1, and cleans up on success', async () => {
    const client = successfulClient();
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockResolvedValue(client);

    const result = await configuredProbe(createClient).test(input());

    expect(result).toEqual({ status: VerificationStatusValue.SUCCEEDED, testedAt: FIXED_NOW });
    expect(client.query).toHaveBeenCalledWith('SELECT 1');
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('cleans up when the validation query fails', async () => {
    const client = new FakeMysqlClient();
    client.query.mockRejectedValue(new Error('query failed'));
    client.end.mockResolvedValue(undefined);
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockResolvedValue(client);

    const result = await configuredProbe(createClient).test(input());

    expect(result.status).toBe(VerificationStatusValue.FAILED);
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('uses resolved addresses in order and retries transient network failures', async () => {
    const secondClient = successfulClient();
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce(secondClient);

    const result = await configuredProbe(createClient).test(input());

    expect(result.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(createClient.mock.calls[0]?.[0].stream).toEqual(expect.any(Function));
  });

  it('falls back only for HANDSHAKE_NO_SSL_SUPPORT in PREFERRED mode', async () => {
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockRejectedValueOnce(
        Object.assign(new Error('not copied to response'), {
          code: 'HANDSHAKE_NO_SSL_SUPPORT',
        }),
      )
      .mockResolvedValueOnce(successfulClient());

    const result = await configuredProbe(createClient).test(input('PREFERRED'));

    expect(result.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(createClient.mock.calls[0]?.[0].ssl).toEqual({
      rejectUnauthorized: false,
      verifyIdentity: false,
    });
    expect(createClient.mock.calls[1]?.[0].ssl).toBe(false);
  });

  it('does not fall back for other TLS errors', async () => {
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockRejectedValue(
        Object.assign(new Error('certificate failure'), { code: 'HANDSHAKE_SSL_ERROR' }),
      );

    const result = await configuredProbe(createClient).test(input('PREFERRED'));

    expect(result).toEqual({
      status: VerificationStatusValue.FAILED,
      testedAt: FIXED_NOW,
      failureReason: 'MySQL TLS certificate verification failed.',
    });
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['DISABLED', false],
    ['PREFERRED', { rejectUnauthorized: false, verifyIdentity: false }],
    ['REQUIRED', { rejectUnauthorized: false, verifyIdentity: false }],
    ['VERIFY_CA', { rejectUnauthorized: true, verifyIdentity: false }],
    ['VERIFY_IDENTITY', { rejectUnauthorized: true, verifyIdentity: true }],
  ] as const)('maps TLS mode %s to mysql2 options', async (sslMode, expectedSsl) => {
    const client = successfulClient();
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockResolvedValue(client);

    await configuredProbe(createClient).test(input(sslMode));

    expect(createClient.mock.calls[0]?.[0].ssl).toEqual(expectedSsl);
  });

  it('pins TCP to the approved IP while preserving the hostname for TLS identity', async () => {
    const client = successfulClient();
    const opened: Array<{ address: string; port: number }> = [];
    let options: ConnectionOptions | undefined;
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockImplementation((value) => {
        options = value;
        const streamFactory = value.stream as (() => unknown) | undefined;
        streamFactory?.();
        return Promise.resolve(client);
      });

    const probe = configuredProbe(createClient, (address, port) => {
      opened.push({ address, port });
      return new PassThrough();
    });

    await probe.test(input('VERIFY_IDENTITY'));

    expect(options).toMatchObject({
      host: 'db.internal',
      port: 3307,
      ssl: { rejectUnauthorized: true, verifyIdentity: true },
    });
    expect(opened).toEqual([{ address: '10.0.0.1', port: 3307 }]);
  });

  it.each([
    ['ER_ACCESS_DENIED_ERROR', undefined, 'MySQL rejected the supplied username or password.'],
    [undefined, 1045, 'MySQL rejected the supplied username or password.'],
    [
      'ER_DBACCESS_DENIED_ERROR',
      undefined,
      'The supplied MySQL user cannot access the requested database.',
    ],
    [undefined, 1049, 'The requested MySQL database does not exist.'],
    [undefined, 3159, 'The MySQL server requires TLS; choose PREFERRED or a stronger TLS mode.'],
    ['ECONNREFUSED', undefined, 'The MySQL destination refused the connection.'],
    ['ETIMEDOUT', undefined, 'The MySQL destination could not be reached before the timeout.'],
    [
      'HANDSHAKE_NO_SSL_SUPPORT',
      undefined,
      'The MySQL server does not support the selected TLS mode.',
    ],
    ['ERR_TLS_CERT_ALTNAME_INVALID', undefined, 'MySQL TLS certificate verification failed.'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', undefined, 'MySQL TLS certificate verification failed.'],
    ['unknown', undefined, 'MySQL connection verification failed.'],
  ])('maps driver failure %s/%s to a safe reason', async (code, errno, failureReason) => {
    const error = Object.assign(new Error('password=super-secret'), { code, errno });
    const createClient = jest
      .fn<Promise<MysqlClient>, [ConnectionOptions]>()
      .mockRejectedValue(error);

    const result = await configuredProbe(createClient).test(input());

    expect(result).toEqual({
      status: VerificationStatusValue.FAILED,
      testedAt: FIXED_NOW,
      failureReason,
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });
});
