import { WatchSourceCapabilityRegistry } from '@infrastructure/data-workflow-watch-source/watch-source-capability.registry';

const trigger = {
  type: 'WATCH_SOURCE' as const,
  mode: 'POLLING' as const,
  databaseServiceId: 'source-1',
  everySeconds: 600,
  relations: [
    {
      schema: 'public',
      table: 'orders',
      cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
    },
  ],
};

describe('WatchSourceCapabilityRegistry', () => {
  const registry = new WatchSourceCapabilityRegistry();

  it.each(['POSTGRESQL', 'MYSQL'])('enables metadata-only polling for %s', (connectorType) => {
    expect(registry.validate({ connectorType }, trigger).issues).toEqual([]);
  });

  it('does not infer MariaDB support from MySQL', () => {
    expect(registry.capabilities({ connectorType: 'MARIADB' })).toMatchObject({
      polling: false,
      cdc: false,
      supportedChangeTypes: [],
      reason: 'UNSUPPORTED_CONNECTOR',
    });
  });

  it('enables CDC operations for PostgreSQL while keeping MariaDB excluded', () => {
    expect(
      registry.validate(
        { connectorType: 'POSTGRESQL' },
        {
          type: 'WATCH_SOURCE',
          mode: 'CDC',
          databaseServiceId: 'source-1',
          aggregationWindowSeconds: 10,
          relations: [{ schema: 'public', table: 'orders' }],
          changeTypes: ['DELETE'],
        },
      ),
    ).toMatchObject({
      capabilities: {
        connectorType: 'POSTGRESQL',
        polling: true,
        cdc: true,
        supportedChangeTypes: ['INSERT', 'UPDATE', 'DELETE'],
      },
      issues: [],
    });
  });

  it('rejects an ambiguous polling cursor on the selected table', () => {
    expect(
      registry.validate(
        { connectorType: 'POSTGRESQL' },
        {
          ...trigger,
          relations: [
            {
              schema: 'public',
              table: 'orders',
              cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'updated_at' },
            },
          ],
        },
      ),
    ).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'NO_RELIABLE_CURSOR',
          relation: expect.objectContaining({ schema: 'public', table: 'orders' }),
        }),
      ]),
    });
  });
});
