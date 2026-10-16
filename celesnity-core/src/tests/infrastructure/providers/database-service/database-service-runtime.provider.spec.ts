import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IConnectionConfigCodec } from '@application/database-service/interfaces/i-connection-config-codec';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import { DatabaseServiceRuntimeProvider } from '@infrastructure/providers/database-service/database-service-runtime.provider';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';

const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-18T01:00:00.000Z');

function storedService(status: 'UNTESTED' | 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED'): DatabaseService {
  const verification =
    status === 'UNTESTED'
      ? VerificationState.untested()
      : status === 'SUCCEEDED'
        ? VerificationState.succeeded(NOW)
        : VerificationState.failed(NOW, 'connection refused');
  return DatabaseService.rehydrate({
    id: ConnectionId.from(DATABASE_SERVICE_ID),
    name: ConnectionName.create('Orders database'),
    connectorType: ConnectorType.create('POSTGRESQL'),
    config: NormalizedConnectionConfig.create(1, {
      host: 'db.internal',
      port: 5432,
      databaseName: 'orders',
      username: 'crawler',
    }),
    credential: CredentialReference.create({
      ciphertext: 'encrypted',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    }),
    credentialSchemaVersion: 1,
    verification,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function dependencies() {
  const repository: IDatabaseServiceRepository & { stored: DatabaseService } = {
    stored: storedService(),
    findById: jest.fn(async () => repository.stored),
    existsByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const vault: ICredentialVault & { decryptCalls: number } = {
    decryptCalls: 0,
    encrypt: jest.fn(),
    decrypt: jest.fn(async () => {
      vault.decryptCalls += 1;
      return 'test-password';
    }),
  };
  const codec: IConnectionConfigCodec = {
    normalize: jest.fn(),
    restore: jest.fn(() => ({
      config: repository.stored.config,
      destination: { host: 'db.internal', port: 5432, engineLabel: 'PostgreSQL' },
    })),
  };
  const plugins: IDatabaseServiceConnectorRegistry = {
    require: jest.fn(() => ({
      connectorType: ConnectorType.create('POSTGRESQL'),
      configCodec: codec,
      probe: {} as never,
      executionAdapter: {} as never,
    })),
  };
  const destinationPolicy: IDestinationPolicy = {
    resolveAllowed: jest.fn(async () => ({
      host: 'db.internal',
      port: 5432,
      engineLabel: 'PostgreSQL',
      addresses: ['10.20.30.40'],
    })),
  };
  return { repository, vault, plugins, destinationPolicy, codec };
}

describe('DatabaseServiceRuntimeProvider', () => {
  it('resolves the current destination and decrypts once for an active verified service', async () => {
    const deps = dependencies();
    const provider = new DatabaseServiceRuntimeProvider(
      deps.repository,
      deps.vault,
      deps.plugins,
      deps.destinationPolicy,
    );

    const profile = await provider.requireVerified(DATABASE_SERVICE_ID);

    expect(profile.connectorType).toBe('POSTGRESQL');
    expect(profile.destinationHost).toBe('db.internal');
    expect(profile.resolvedAddresses).toEqual(['10.20.30.40']);
    expect(deps.vault.decryptCalls).toBe(1);
    expect(JSON.stringify(profile)).not.toContain('test-password');
    expect(JSON.stringify(PlaintextCredentialPayload.create(1, 'test-password'))).toBe(
      '"[REDACTED]"',
    );
  });

  it.each(['UNTESTED', 'FAILED'] as const)('rejects %s services', async (status) => {
    const deps = dependencies();
    deps.repository.stored = storedService(status);
    const provider = new DatabaseServiceRuntimeProvider(
      deps.repository,
      deps.vault,
      deps.plugins,
      deps.destinationPolicy,
    );

    await expect(provider.requireVerified(DATABASE_SERVICE_ID)).rejects.toThrow('verified');
    expect(deps.vault.decryptCalls).toBe(0);
  });
});
