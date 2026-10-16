import type { ClientConfig } from 'pg';

import type { ConnectionProbeInput } from '@application/database-service/interfaces/i-connection-probe';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import {
  PostgresConnectionProbe,
  type PostgresClient,
} from '@infrastructure/dbms/postgresql/postgres-connection.probe';

const FIXED_NOW = new Date('2026-08-06T00:00:00.000Z');
const codec = new PostgresConfigCodec();

class FakeClient implements PostgresClient {
  public readonly connect = jest.fn<Promise<void>, []>();
  public readonly query = jest.fn<Promise<unknown>, [string]>();
  public readonly end = jest.fn<Promise<void>, []>();
}

function input(sslMode = 'require'): ConnectionProbeInput {
  const normalized = codec.normalize({
    host: 'db.internal',
    port: 6432,
    databaseName: 'analytics',
    username: 'alice',
    password: 's3cr3t',
    sslMode,
    options: { applicationName: 'celesnity' },
  });
  return {
    config: normalized.config,
    resolvedAddresses: ['10.0.0.1', '10.0.0.2'],
    credential: normalized.credential ?? PlaintextCredentialPayload.create(1, 's3cr3t'),
  };
}

function probe(clients: readonly FakeClient[]): PostgresConnectionProbe {
  let index = 0;
  return new PostgresConnectionProbe(codec, {
    timeoutMilliseconds: 1_200,
    createClient: () => clients[index++] ?? new FakeClient(),
    now: (): Date => FIXED_NOW,
  });
}

describe('PostgresConnectionProbe', () => {
  it('rejects a credential encoded with another schema version before connecting', async () => {
    const client = new FakeClient();
    const incompatible = {
      ...input(),
      credential: PlaintextCredentialPayload.create(2, 's3cr3t'),
    };

    await expect(probe([client]).test(incompatible)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Connection credential payload is invalid.',
      name: ConnectionError.name,
    });
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('decodes generic input, queries SELECT 1, and returns a safe success', async () => {
    const client = new FakeClient();
    client.connect.mockResolvedValue(undefined);
    client.query.mockResolvedValue({ rows: [] });
    client.end.mockResolvedValue(undefined);

    const result = await probe([client]).test(input());

    expect(result).toEqual({ status: VerificationStatusValue.SUCCEEDED, testedAt: FIXED_NOW });
    expect(client.query).toHaveBeenCalledWith('SELECT 1');
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('uses resolved addresses in order and retries transient network failures', async () => {
    const first = new FakeClient();
    first.connect.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    first.end.mockResolvedValue(undefined);
    const second = new FakeClient();
    second.connect.mockResolvedValue(undefined);
    second.query.mockResolvedValue({ rows: [] });
    second.end.mockResolvedValue(undefined);

    const result = await probe([first, second]).test(input());

    expect(result.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(first.end).toHaveBeenCalledTimes(1);
    expect(second.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('preserves prefer negotiation by trying require and then disable on SSL refusal', async () => {
    const requireClient = new FakeClient();
    requireClient.connect.mockRejectedValue(
      new Error('The server does not support SSL connections'),
    );
    requireClient.end.mockResolvedValue(undefined);
    const disableClient = new FakeClient();
    disableClient.connect.mockResolvedValue(undefined);
    disableClient.query.mockResolvedValue({ rows: [] });
    disableClient.end.mockResolvedValue(undefined);

    const result = await probe([requireClient, disableClient]).test(input('prefer'));

    expect(result.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(disableClient.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('maps driver errors to safe failure reasons without leaking details', async () => {
    const client = new FakeClient();
    client.connect.mockRejectedValue(
      Object.assign(new Error('password=super-secret'), { code: '28P01' }),
    );
    client.end.mockResolvedValue(undefined);

    const result = await probe([client]).test(input());

    expect(result).toEqual({
      status: VerificationStatusValue.FAILED,
      testedAt: FIXED_NOW,
      failureReason: 'PostgreSQL rejected the supplied username or password.',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
  });

  it('passes the decoded PostgreSQL client settings to the driver', async () => {
    const client = new FakeClient();
    client.connect.mockResolvedValue(undefined);
    client.query.mockResolvedValue({ rows: [] });
    client.end.mockResolvedValue(undefined);
    let clientConfig: ClientConfig | undefined;

    const configuredProbe = new PostgresConnectionProbe(codec, {
      timeoutMilliseconds: 1_200,
      createClient: (config: ClientConfig): FakeClient => {
        clientConfig = config;
        return client;
      },
      now: (): Date => FIXED_NOW,
    });

    await configuredProbe.test(input());

    expect(clientConfig).toMatchObject({
      host: '10.0.0.1',
      port: 6432,
      database: 'analytics',
      user: 'alice',
      password: 's3cr3t',
      application_name: 'celesnity',
      connectionTimeoutMillis: 1_200,
      query_timeout: 1_200,
      statement_timeout: 1_200,
      ssl: { rejectUnauthorized: false, servername: 'db.internal' },
    });
  });
});
