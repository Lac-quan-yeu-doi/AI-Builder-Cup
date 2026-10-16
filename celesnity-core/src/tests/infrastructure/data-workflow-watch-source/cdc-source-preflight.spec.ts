import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  CdcSourcePreflight,
  type CdcSourcePreflightDependencies,
} from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';
import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';

describe('CdcSourcePreflight', () => {
  it('rejects Supabase pooler endpoints before attempting replication queries', async () => {
    const createPostgresClient = jest.fn();

    await expect(
      new CdcSourcePreflight({ createPostgresClient }).check(
        profile('POSTGRESQL', 'aws-0-ap-southeast-2.pooler.supabase.com'),
      ),
    ).resolves.toMatchObject({
      available: false,
      code: 'DIRECT_CONNECTION_REQUIRED',
    });
    expect(createPostgresClient).not.toHaveBeenCalled();
  });

  it('requires PostgreSQL logical WAL and replication privilege', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ wal_level: 'logical' }] })
        .mockResolvedValueOnce({ rows: [{ rolreplication: true }] })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const dependencies: CdcSourcePreflightDependencies = {
      createPostgresClient: jest.fn().mockReturnValue(client),
    };

    await expect(
      new CdcSourcePreflight(dependencies).check(profile('POSTGRESQL')),
    ).resolves.toMatchObject({ available: true, code: 'READY' });
    expect(client.query).toHaveBeenNthCalledWith(1, 'SHOW wal_level');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'SELECT rolreplication FROM pg_roles WHERE rolname = current_user',
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('checks existing publication and slot visibility with read-only catalog queries', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ wal_level: 'logical' }] })
        .mockResolvedValueOnce({ rows: [{ rolreplication: true }] })
        .mockResolvedValueOnce({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new CdcSourcePreflight({ createPostgresClient: () => client }).check(
        profile('POSTGRESQL'),
      ),
    ).resolves.toMatchObject({ available: false, code: 'CDC_PUBLICATION_REQUIRED' });
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      'SELECT 1 FROM pg_publication WHERE pubname = $1',
      ['existing_publication'],
    );
    expect(client.query.mock.calls.flat().join(' ')).not.toMatch(/CREATE|ALTER|DROP/iu);
  });

  it('reports PostgreSQL WAL misconfiguration without exposing source details', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ rows: [{ wal_level: 'replica' }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new CdcSourcePreflight({ createPostgresClient: () => client }).check(profile('POSTGRESQL')),
    ).resolves.toMatchObject({
      available: false,
      code: 'WAL_LEVEL_NOT_LOGICAL',
      message: expect.not.stringContaining('customer-db'),
    });
  });

  it('requires MySQL row binlogs and replication privileges', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ Variable_name: 'log_bin', Value: 'ON' }], []])
        .mockResolvedValueOnce([[{ Variable_name: 'binlog_format', Value: 'ROW' }], []])
        .mockResolvedValueOnce([
          [{ Grants: 'GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO cdc_user' }],
          [],
        ]),
      end: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new CdcSourcePreflight({ createMysqlClient: async () => client }).check(profile('MYSQL')),
    ).resolves.toMatchObject({ available: true, code: 'READY' });
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('reports MySQL non-row binlogs before checking grants', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ Variable_name: 'log_bin', Value: 'ON' }], []])
        .mockResolvedValueOnce([[{ Variable_name: 'binlog_format', Value: 'STATEMENT' }], []]),
      end: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new CdcSourcePreflight({ createMysqlClient: async () => client }).check(profile('MYSQL')),
    ).resolves.toMatchObject({ available: false, code: 'BINLOG_FORMAT_NOT_ROW' });
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});

function profile(connectorType: string, host = 'customer-db'): CdcConnectionRuntimeProfile {
  return {
    id: 'source-1',
    connectorType,
    config: NormalizedConnectionConfig.create(1, {
      databaseName: 'sales',
      host,
      port: connectorType === 'MYSQL' ? 3306 : 5432,
      sslMode: connectorType === 'MYSQL' ? 'DISABLED' : 'disable',
      username: 'cdc_user',
    }),
    credential: PlaintextCredentialPayload.create(1, 'secret'),
    destinationHost: host,
    destinationPort: connectorType === 'MYSQL' ? 3306 : 5432,
    resolvedAddresses: ['10.0.0.5'],
    setupMode: CdcConnectionSetupMode.EXISTING,
    publicationName: connectorType === 'POSTGRESQL' ? 'existing_publication' : undefined,
    slotName: connectorType === 'POSTGRESQL' ? 'existing_slot' : undefined,
  };
}
