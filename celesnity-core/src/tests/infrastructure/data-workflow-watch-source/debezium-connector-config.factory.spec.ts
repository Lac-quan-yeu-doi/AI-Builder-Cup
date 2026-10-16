import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  DebeziumConnectorConfigFactory,
  connectorName,
} from '@infrastructure/data-workflow-watch-source/debezium-connector-config.factory';
import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';

const trigger = {
  type: 'WATCH_SOURCE' as const,
  mode: 'CDC' as const,
  databaseServiceId: 'source-1',
  aggregationWindowSeconds: 10,
  relations: [
    { schema: 'analytics', table: 'customers' },
    { schema: 'public', table: 'orders' },
  ],
  changeTypes: ['INSERT', 'UPDATE', 'DELETE'] as const,
};

describe('DebeziumConnectorConfigFactory', () => {
  it('builds a deterministic PostgreSQL metadata-only connector', () => {
    const spec = new DebeziumConnectorConfigFactory().build(
      'org-1',
      'source-1',
      profile('POSTGRESQL'),
      trigger,
    );

    expect(spec.name).toBe(connectorName('org-1', 'source-1'));
    expect(spec.config).toMatchObject({
      'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
      'snapshot.mode': 'no_data',
      'plugin.name': 'pgoutput',
      'publication.autocreate.mode': 'disabled',
      'publication.name': 'existing_publication',
      'slot.name': 'existing_slot',
      'table.include.list': 'analytics.customers,public.orders',
      'tombstones.on.delete': 'false',
      transforms: 'metadata,route',
      'transforms.metadata.type': 'io.celesnity.debezium.MetadataOnlyTransform',
      'transforms.route.type': 'org.apache.kafka.connect.transforms.RegexRouter',
      'transforms.route.regex': '.*',
      'transforms.route.replacement': 'celesnity.data-workflow.cdc.v1',
      'database.password': 'secret',
    });
  });

  it('uses filtered publication management only for an explicitly managed profile', () => {
    const spec = new DebeziumConnectorConfigFactory().build(
      'org-1',
      'source-1',
      profile('POSTGRESQL', CdcConnectionSetupMode.MANAGED),
      trigger,
    );

    expect(spec.config['publication.autocreate.mode']).toBe('filtered');
    expect(spec.config['publication.name']).toMatch(/^celesnity_/u);
    expect(spec.config['slot.name']).toMatch(/^celesnity_/u);
  });

  it('builds MySQL with a stable server id and rejects unsupported DBMS', () => {
    const factory = new DebeziumConnectorConfigFactory();
    const first = factory.build('org-1', 'source-1', profile('MYSQL'), trigger);
    const second = factory.build('org-1', 'source-1', profile('MYSQL'), trigger);
    expect(first.config['database.server.id']).toBe(second.config['database.server.id']);
    expect(first.config['connector.class']).toBe('io.debezium.connector.mysql.MySqlConnector');
    expect(first.config['database.include.list']).toBe('sales');
    expect(first.config['database.dbname']).toBeUndefined();
    expect(() => factory.build('org-1', 'source-1', profile('MARIADB'), trigger)).toThrow(
      'unsupported',
    );
  });
});

function profile(
  connectorType: string,
  setupMode = CdcConnectionSetupMode.EXISTING,
): CdcConnectionRuntimeProfile {
  return {
    id: 'source-1',
    connectorType,
    config: NormalizedConnectionConfig.create(1, {
      host: 'customer-db',
      port: 5432,
      databaseName: 'sales',
      username: 'cdc_user',
    }),
    credential: PlaintextCredentialPayload.create(1, 'secret'),
    destinationHost: 'customer-db',
    destinationPort: 5432,
    resolvedAddresses: ['10.0.0.5'],
    setupMode,
    publicationName:
      connectorType === 'POSTGRESQL' && setupMode === CdcConnectionSetupMode.EXISTING
        ? 'existing_publication'
        : undefined,
    slotName:
      connectorType === 'POSTGRESQL' && setupMode === CdcConnectionSetupMode.EXISTING
        ? 'existing_slot'
        : undefined,
  };
}
