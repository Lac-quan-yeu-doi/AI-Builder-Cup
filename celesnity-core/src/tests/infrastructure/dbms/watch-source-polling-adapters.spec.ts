import {
  encodeWatchSourceCheckpoint,
  EMPTY_WATCH_SOURCE_CHECKPOINT,
} from '@application/data-workflow-watch-source/watch-source-checkpoint';
import {
  MysqlWatchSourceAdapter,
} from '@infrastructure/dbms/mysql/mysql-watch-source.adapter';
import {
  POSTGRES_WATCH_SOURCE_ADAPTER_KEY,
  PostgresWatchSourceAdapter,
} from '@infrastructure/dbms/postgresql/postgres-watch-source.adapter';

const source = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId: '11111111-1111-4111-8111-111111111111',
  databaseServiceId: '33333333-3333-4333-8333-333333333333',
  adapterKey: POSTGRES_WATCH_SOURCE_ADAPTER_KEY,
  adapterVersion: '1',
  trigger: {
    type: 'WATCH_SOURCE' as const,
    mode: 'POLLING' as const,
    databaseServiceId: '33333333-3333-4333-8333-333333333333',
    everySeconds: 600,
    relations: [
      {
        schema: 'public',
        table: 'orders',
        cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
      },
    ],
  },
  enabled: true,
  revision: 1,
  nextCaptureAt: new Date('2026-09-18T09:00:00.000Z'),
  createdAt: new Date('2026-09-18T09:00:00.000Z'),
  updatedAt: new Date('2026-09-18T09:00:00.000Z'),
};

const profileValue = {
  id: source.databaseServiceId,
  connectorType: 'POSTGRESQL',
  config: {} as never,
  credential: { value: 'secret' },
  destinationHost: 'database.example.test',
  destinationPort: 5432,
  resolvedAddresses: ['10.0.0.4'],
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    profile: profileValue as never,
    source,
    relation: { schema: 'public', table: 'orders' },
    cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
    checkpoint: EMPTY_WATCH_SOURCE_CHECKPOINT,
    limit: 50,
    deadline: new Date(Date.now() + 60_000),
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('Watch Source polling adapters', () => {
  it('uses quoted, bounded PostgreSQL polling and emits an opaque checkpoint', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ __watch_change: '2026-09-18T09:00:00Z', __watch_tie: 4 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { __watch_change: '2026-09-18T09:00:01Z', __watch_tie: 5 },
            { __watch_change: '2026-09-18T09:00:02Z', __watch_tie: 6 },
          ],
        }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const codec = { decode: jest.fn().mockReturnValue(postgresValues()) };
    const adapter = new PostgresWatchSourceAdapter(codec, () => client);

    const baseline = await adapter.establishBaseline(input());
    const observation = await adapter.poll(input({ checkpoint: baseline }));

    expect(baseline).toMatch(/^watch:v1:/u);
    expect(observation?.throughCheckpoint).toBe(
      encodeWatchSourceCheckpoint({ change: '2026-09-18T09:00:02Z', tie: '6' }),
    );
    expect(client.query).toHaveBeenNthCalledWith(2, expect.stringContaining('LIMIT $3'), [
      '2026-09-18T09:00:00Z',
      '4',
      50,
    ]);
    expect(client.query.mock.calls[1]?.[0]).toContain('"public"."orders"');
    expect(client.query.mock.calls[1]?.[0]).not.toContain('sourceRow');
    expect(client.end).toHaveBeenCalledTimes(2);
  });

  it('binds the repeated MySQL cursor parameter and never interpolates values', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValue([[{ __watch_change: '2026-09-18T09:00:02Z', __watch_tie: 6 }], []]),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const codec = { decode: jest.fn().mockReturnValue(mysqlValues()) };
    const adapter = new MysqlWatchSourceAdapter(codec, async () => client);

    const observation = await adapter.poll(
      input({
        profile: { ...profileValue, connectorType: 'MYSQL' },
        checkpoint: encodeWatchSourceCheckpoint({
          change: '2026-09-18T09:00:01Z',
          tie: '5',
        }),
      }),
    );

    expect(observation?.changeTypes).toEqual(['INSERT', 'UPDATE']);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), [
      '2026-09-18T09:00:01Z',
      '2026-09-18T09:00:01Z',
      '5',
      50,
    ]);
    expect(client.query.mock.calls[0]?.[0]).toContain('`public`.`orders`');
  });

  it('reports polling observations as new-or-changed rows without a delete filter', async () => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({
        rows: [{ __watch_change: '2026-09-18T09:00:02Z', __watch_tie: 6 }],
      }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const adapter = new PostgresWatchSourceAdapter(
      { decode: jest.fn().mockReturnValue(postgresValues()) },
      () => client,
    );

    await expect(adapter.poll(input())).resolves.toMatchObject({
      changeTypes: ['INSERT', 'UPDATE'],
    });
  });
});

function postgresValues() {
  return {
    endpoint: { host: 'database.example.test', port: 5432 },
    databaseName: { value: 'customer' },
    username: { value: 'reader' },
    sslMode: { value: 'disable' },
  };
}

function mysqlValues() {
  return {
    endpoint: { host: 'database.example.test', port: 3306 },
    databaseName: { value: 'customer' },
    username: { value: 'reader' },
    sslMode: { value: 'DISABLED' },
  };
}
