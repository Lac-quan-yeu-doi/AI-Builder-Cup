import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';
import { DebeziumConnectorManager } from '@infrastructure/data-workflow-watch-source/debezium-connector.manager';
import type { DebeziumConnectClient } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';
import type { DebeziumConnectorConfigFactory } from '@infrastructure/data-workflow-watch-source/debezium-connector-config.factory';

const trigger = {
  type: 'WATCH_SOURCE' as const,
  mode: 'CDC' as const,
  databaseServiceId: 'source-1',
  aggregationWindowSeconds: 10,
  relations: [{ schema: 'public', table: 'orders' }],
  changeTypes: ['INSERT', 'UPDATE', 'DELETE'] as const,
};

describe('DebeziumConnectorManager', () => {
  it('uses the Connect collection endpoint as a readiness probe', async () => {
    const client = {
      checkHealth: jest.fn().mockResolvedValue(undefined),
    } as unknown as DebeziumConnectClient;
    const manager = new DebeziumConnectorManager(client, {} as DebeziumConnectorConfigFactory);

    await expect(manager.preflight(profile(), trigger)).resolves.toMatchObject({
      available: true,
      code: 'READY',
    });
    expect(client.checkHealth).toHaveBeenCalledTimes(1);
  });

  it('reports failed when Connect says the connector runs but a task failed', async () => {
    const client = {
      checkHealth: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockResolvedValue({
        name: 'cdc-1',
        connectorState: 'RUNNING',
        taskStates: ['FAILED'],
      }),
    } as unknown as DebeziumConnectClient;
    const factory = {
      build: jest.fn().mockReturnValue({ name: 'cdc-1', config: {} }),
    } as unknown as DebeziumConnectorConfigFactory;
    const manager = new DebeziumConnectorManager(client, factory);

    await expect(
      manager.reconcile({
        organizationId: 'org-1',
        databaseServiceId: 'source-1',
        profile: profile(),
        trigger,
      }),
    ).resolves.toMatchObject({ lifecycle: 'FAILED' });
  });
});

function profile(): CdcConnectionRuntimeProfile {
  return {
    id: 'source-1',
    connectorType: 'POSTGRESQL',
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
    setupMode: CdcConnectionSetupMode.EXISTING,
    publicationName: 'existing_publication',
    slotName: 'existing_slot',
  };
}
