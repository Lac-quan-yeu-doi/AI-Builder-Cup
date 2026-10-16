import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import {
  CdcConnectionProfileUseCases,
  type PutCdcConnectionProfileCommand,
} from '@application/database-service/cdc-connection-profile.use-cases';
import type { ICdcConnectionPreflight } from '@application/database-service/interfaces/i-cdc-connection-preflight';
import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { ICdcConnectionUsageReader } from '@application/database-service/interfaces/i-cdc-connection-usage-reader';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type {
  DatabaseServiceConnector,
  IDatabaseServiceConnectorRegistry,
} from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IConnectionConfigCodec } from '@application/database-service/interfaces/i-connection-config-codec';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import {
  CdcConnectionSetupMode,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { FixedClock, SequentialIdGenerator } from '@tests/support/deterministic-ports';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-21T02:00:00.000Z');
const POSTGRESQL = ConnectorType.create('POSTGRESQL');

function encrypted(value = 'secret'): CredentialReference {
  return CredentialReference.create({
    ciphertext: `encrypted-${value}`,
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function parent(): DatabaseService {
  return DatabaseService.rehydrate({
    id: ConnectionId.from(DATABASE_SERVICE_ID),
    name: ConnectionName.create('customer postgres'),
    connectorType: POSTGRESQL,
    config: NormalizedConnectionConfig.create(1, {
      databaseName: 'postgres',
      host: 'pooler.example.test',
      options: {},
      port: 5432,
      sslMode: 'require',
      username: 'default-user',
    }),
    credential: encrypted('default'),
    credentialSchemaVersion: 1,
    verification: VerificationState.untested(),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

class FakeProfileRepository implements ICdcConnectionProfileRepository {
  public stored: CdcConnectionProfile | undefined;
  public create(profile: CdcConnectionProfile): Promise<void> {
    this.stored = profile;
    return Promise.resolve();
  }
  public findByDatabaseService(
    organizationId: string,
    databaseServiceId: ConnectionId,
  ): Promise<CdcConnectionProfile | undefined> {
    return Promise.resolve(
      this.stored?.organizationId === organizationId &&
        this.stored.databaseServiceId.equals(databaseServiceId)
        ? this.stored
        : undefined,
    );
  }
  public update(profile: CdcConnectionProfile): Promise<boolean> {
    this.stored = profile;
    return Promise.resolve(true);
  }
  public delete(): Promise<boolean> {
    this.stored = undefined;
    return Promise.resolve(true);
  }
}

class FakeDatabaseRepository implements IDatabaseServiceRepository {
  public findById(id: ConnectionId): Promise<DatabaseService | undefined> {
    return Promise.resolve(id.value === DATABASE_SERVICE_ID ? parent() : undefined);
  }
  public existsByName(): Promise<boolean> {
    return Promise.resolve(false);
  }
  public create(): Promise<void> {
    return Promise.resolve();
  }
  public update(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class FakeCodec implements IConnectionConfigCodec {
  public normalize(input: unknown) {
    const details = input as Record<string, unknown>;
    return {
      config: NormalizedConnectionConfig.create(1, {
        databaseName: details.databaseName as string,
        host: details.host as string,
        options: {},
        port: details.port as number,
        sslMode: 'require',
        username: details.username as string,
      }),
      destination: {
        addresses: [],
        engineLabel: 'PostgreSQL',
        host: details.host as string,
        port: details.port as number,
      },
      credential: PlaintextCredentialPayload.create(1, details.password as string),
    };
  }
  public restore(config: NormalizedConnectionConfig) {
    const record = config.toRecord();
    return {
      config,
      destination: {
        addresses: [],
        engineLabel: 'PostgreSQL',
        host: record.host as string,
        port: record.port as number,
      },
    };
  }
}

class FakeVault implements ICredentialVault {
  public encrypt(value: string): Promise<CredentialReference> {
    return Promise.resolve(encrypted(value));
  }
  public decrypt(): Promise<string> {
    return Promise.resolve('cdc-secret');
  }
}

function authenticatedContext() {
  return {
    identityId: '33333333-3333-4333-8333-333333333333',
    subject: 'tester',
    identityTenantId: 'tenant',
    organizationId: ORGANIZATION_ID,
    organizationStatus: 'ACTIVE' as const,
    mfaRequired: false,
    membershipId: '44444444-4444-4444-8444-444444444444',
    role: 'ORG_ADMIN' as const,
    authenticationTime: 0,
    mfaVerified: true,
    visibleFeatures: null,
  };
}

function putCommand(): PutCdcConnectionProfileCommand {
  return {
    databaseServiceId: DATABASE_SERVICE_ID,
    details: {
      host: 'db.direct.example.test',
      port: 5432,
      databaseName: 'postgres',
      username: 'cdc_user',
      password: 'cdc-secret',
    },
    setupMode: CdcConnectionSetupMode.EXISTING,
    publicationName: 'celesnity_publication',
    slotName: 'celesnity_slot',
  };
}

describe('CdcConnectionProfileUseCases', () => {
  const profiles = new FakeProfileRepository();
  const contexts = new AuthenticatedContextStore();
  const preflight: ICdcConnectionPreflight = {
    validate: jest.fn().mockResolvedValue({ status: CdcConnectionVerificationStatus.READY }),
  };
  const usage: ICdcConnectionUsageReader = {
    hasActiveCdcSubscriptions: jest.fn().mockResolvedValue(false),
  };
  const connector: DatabaseServiceConnector = {
    connectorType: POSTGRESQL,
    configCodec: new FakeCodec(),
    probe: { test: jest.fn() },
    executionAdapter: { build: jest.fn() },
  };
  const registry: IDatabaseServiceConnectorRegistry = { require: () => connector };
  const useCases = new CdcConnectionProfileUseCases(
    profiles,
    new FakeDatabaseRepository(),
    new FakeVault(),
    registry,
    preflight,
    usage,
    new FakeUnitOfWork(),
    new FixedClock(NOW),
    new SequentialIdGenerator('22222222-2222-4222-8222'),
    contexts,
  );

  beforeEach(() => {
    profiles.stored = undefined;
    jest.clearAllMocks();
  });

  it('stores an independently encrypted unverified CDC profile without contacting preflight', async () => {
    const view = await contexts.run(authenticatedContext(), () => useCases.put(putCommand()));

    expect(view).toMatchObject({
      databaseServiceId: DATABASE_SERVICE_ID,
      endpointSummary: 'db.direct.example.test:5432/postgres',
      verificationStatus: CdcConnectionVerificationStatus.UNTESTED,
    });
    expect(profiles.stored?.credential.ciphertext).toBe('encrypted-cdc-secret');
    expect(preflight.validate).not.toHaveBeenCalled();
    expect(JSON.stringify(view)).not.toContain('cdc-secret');
  });

  it('validates through the non-mutating preflight and persists only the safe result', async () => {
    await contexts.run(authenticatedContext(), () => useCases.put(putCommand()));
    const view = await contexts.run(authenticatedContext(), () =>
      useCases.validate(DATABASE_SERVICE_ID),
    );

    expect(preflight.validate).toHaveBeenCalledTimes(1);
    expect(view.verificationStatus).toBe(CdcConnectionVerificationStatus.READY);
    expect(JSON.stringify(view)).not.toContain('cdc-secret');
  });

  it('rejects removal while active CDC subscriptions use the datasource', async () => {
    await contexts.run(authenticatedContext(), () => useCases.put(putCommand()));
    jest.mocked(usage.hasActiveCdcSubscriptions).mockResolvedValueOnce(true);

    await expect(
      contexts.run(authenticatedContext(), () => useCases.remove(DATABASE_SERVICE_ID)),
    ).rejects.toThrow('active CDC workflows');
    expect(profiles.stored).toBeDefined();
  });
});
