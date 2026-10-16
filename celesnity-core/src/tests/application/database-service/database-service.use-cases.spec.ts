import { DatabaseServiceUseCases } from '@application/database-service/database-service.use-cases';
import type { ConnectionTestResult } from '@application/database-service/interfaces/i-connection-probe';
import type {
  DatabaseServiceConnector,
  IConnectionConfigCodec,
  IConnectionProbe,
  IDatabaseServiceConnectorRegistry,
  IExecutionConnectionAdapter,
  NormalizedConnectionDetails,
} from '@application/database-service/interfaces';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type {
  IDestinationPolicy,
  ResolvedDestination,
} from '@application/database-service/interfaces/i-destination-policy';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { FixedClock, SequentialIdGenerator } from '@tests/support/deterministic-ports';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const POSTGRESQL_TYPE = ConnectorType.create('POSTGRESQL');
const TEST_DBMS_TYPE = ConnectorType.create('TEST_DBMS');
const TESTED_AT = new Date('2026-08-04T10:00:00.000Z');

function credential(suffix = 'cipher'): CredentialReference {
  return CredentialReference.create({
    ciphertext: suffix,
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function config(type: ConnectorType): NormalizedConnectionConfig {
  return type.equals(TEST_DBMS_TYPE)
    ? NormalizedConnectionConfig.create(1, { catalog: 7, endpoint: 'unit-test' })
    : NormalizedConnectionConfig.create(1, {
        databaseName: 'analytics',
        host: 'db.internal',
        options: {},
        port: 6432,
        sslMode: 'require',
        username: 'alice',
      });
}

class FakeCodec implements IConnectionConfigCodec {
  public readonly normalizeCalls: unknown[] = [];
  public readonly restoreCalls: NormalizedConnectionConfig[] = [];

  public constructor(
    private readonly type: ConnectorType,
    private readonly nextConfig?: NormalizedConnectionConfig,
  ) {}

  public normalize(
    input: unknown,
    existing?: NormalizedConnectionConfig,
  ): NormalizedConnectionDetails {
    this.normalizeCalls.push({ input, existing });
    const raw = typeof input === 'object' && input !== null ? input : {};
    const password =
      'password' in raw && typeof raw.password === 'string' ? raw.password : undefined;
    const catalog = 'catalog' in raw && typeof raw.catalog === 'number' ? raw.catalog : undefined;
    const normalizedConfig =
      this.type.equals(TEST_DBMS_TYPE) && catalog !== undefined
        ? NormalizedConnectionConfig.create(1, { catalog, endpoint: 'unit-test' })
        : (this.nextConfig ?? existing ?? config(this.type));
    return {
      config: normalizedConfig,
      destination: destination(this.type),
      credential:
        password === undefined ? undefined : PlaintextCredentialPayload.create(1, password),
    };
  }

  public restore(
    stored: NormalizedConnectionConfig,
  ): Omit<NormalizedConnectionDetails, 'credential'> {
    this.restoreCalls.push(stored);
    return { config: stored, destination: destination(this.type) };
  }
}

class FakeProbe implements IConnectionProbe {
  public calls = 0;
  public inputSeen: Parameters<IConnectionProbe['test']>[0] | undefined;
  public result: ConnectionTestResult = {
    status: VerificationStatusValue.SUCCEEDED,
    testedAt: TESTED_AT,
  };

  public test(input: Parameters<IConnectionProbe['test']>[0]): Promise<ConnectionTestResult> {
    this.calls += 1;
    this.inputSeen = input;
    return Promise.resolve(this.result);
  }
}

class FakeExecutionAdapter implements IExecutionConnectionAdapter {
  public build(): never {
    throw new Error('not used in database-service use-case tests');
  }
}

class FakePluginRegistry implements IDatabaseServiceConnectorRegistry {
  public constructor(private readonly plugins: readonly DatabaseServiceConnector[]) {}

  public require(connectorType: ConnectorType): DatabaseServiceConnector {
    const plugin = this.plugins.find((candidate) => candidate.connectorType.equals(connectorType));
    if (plugin === undefined) {
      throw new Error(`Unsupported database type: ${connectorType.value}.`);
    }
    return plugin;
  }
}

class FakeRepository implements IDatabaseServiceRepository {
  public updateResult = true;
  public readonly created: DatabaseService[] = [];
  public readonly updated: DatabaseService[] = [];

  public constructor(private readonly stored: DatabaseService | undefined) {}

  public findById(): Promise<DatabaseService | undefined> {
    return Promise.resolve(this.stored);
  }

  public existsByName(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public create(connection: DatabaseService): Promise<void> {
    this.created.push(connection);
    return Promise.resolve();
  }

  public update(connection: DatabaseService): Promise<boolean> {
    this.updated.push(connection);
    return Promise.resolve(this.updateResult);
  }
}

class FakeReader implements IDatabaseServiceReader {
  public listActive(): Promise<DatabaseServiceListPage> {
    return Promise.resolve({ items: [], page: 1, pageSize: 50, total: 0 });
  }

  public findActiveById(): Promise<DatabaseServiceView | undefined> {
    return Promise.resolve(undefined);
  }
}

class FakeVault implements ICredentialVault {
  public decryptedWith: CredentialReference | undefined;

  public constructor(private readonly plaintext = 'stored-pass') {}

  public encrypt(value: string): Promise<CredentialReference> {
    return Promise.resolve(credential(`encrypted-${value}`));
  }

  public decrypt(reference: CredentialReference): Promise<string> {
    this.decryptedWith = reference;
    return Promise.resolve(this.plaintext);
  }
}

class FakeDestinationPolicy implements IDestinationPolicy {
  public rejection: Error | undefined;
  public readonly calls: ResolvedDestination[] = [];

  public resolveAllowed(destination: ResolvedDestination): Promise<ResolvedDestination> {
    this.calls.push(destination);
    if (this.rejection !== undefined) {
      return Promise.reject(this.rejection);
    }
    return Promise.resolve({ ...destination, addresses: ['10.0.0.5'] });
  }
}

class FakeMembershipRepository implements IDatabaseServiceMembershipRepository {
  public any = false;
  public readonly attached: string[] = [];
  public attachError: Error | undefined;

  public listDatabaseNames(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  public listDatabaseServiceIds(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  public exists(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public hasAny(): Promise<boolean> {
    return Promise.resolve(this.any);
  }

  public lockExisting(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public attach(id: string): Promise<void> {
    if (this.attachError !== undefined) return Promise.reject(this.attachError);
    this.attached.push(id);
    return Promise.resolve();
  }

  public detach(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeCatalogReader implements IDatabaseCatalogReader {
  public exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

interface Harness {
  readonly useCases: DatabaseServiceUseCases;
  readonly repository: FakeRepository;
  readonly vault: FakeVault;
  readonly policy: FakeDestinationPolicy;
  readonly postgres: { readonly codec: FakeCodec; readonly probe: FakeProbe };
  readonly testDbms: { readonly codec: FakeCodec; readonly probe: FakeProbe };
  readonly unitOfWork: FakeUnitOfWork;
  readonly memberships: FakeMembershipRepository;
}

function destination(type: ConnectorType): ResolvedDestination {
  return {
    addresses: [],
    host: type.equals(TEST_DBMS_TYPE) ? 'unit-test' : 'db.internal',
    port: type.equals(TEST_DBMS_TYPE) ? 1000 : 6432,
    engineLabel: type.value === 'TEST_DBMS' ? 'Test DBMS' : 'PostgreSQL',
  };
}

function aggregate(type = TEST_DBMS_TYPE): DatabaseService {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return DatabaseService.rehydrate({
    id: ConnectionId.from(CONNECTION_ID),
    name: ConnectionName.create('analytics'),
    connectorType: type,
    config: config(type),
    credential: credential(),
    credentialSchemaVersion: 1,
    verification: VerificationState.untested(),
    createdAt: now,
    updatedAt: now,
  });
}

function harnessFor(...args: [] | [DatabaseService | undefined]): Harness {
  const stored = args.length === 0 ? aggregate() : args[0];
  const postgres = { codec: new FakeCodec(POSTGRESQL_TYPE), probe: new FakeProbe() };
  const testDbms = { codec: new FakeCodec(TEST_DBMS_TYPE), probe: new FakeProbe() };
  const plugins: DatabaseServiceConnector[] = [
    {
      connectorType: POSTGRESQL_TYPE,
      configCodec: postgres.codec,
      probe: postgres.probe,
      executionAdapter: new FakeExecutionAdapter(),
    },
    {
      connectorType: TEST_DBMS_TYPE,
      configCodec: testDbms.codec,
      probe: testDbms.probe,
      executionAdapter: new FakeExecutionAdapter(),
    },
  ];
  const repository = new FakeRepository(stored);
  const memberships = new FakeMembershipRepository();
  const catalogs = new FakeCatalogReader();
  const vault = new FakeVault();
  const policy = new FakeDestinationPolicy();
  const unitOfWork = new FakeUnitOfWork();
  return {
    useCases: new DatabaseServiceUseCases(
      repository,
      new FakeReader(),
      vault,
      new FakePluginRegistry(plugins),
      policy,
      unitOfWork,
      new FixedClock(),
      new SequentialIdGenerator(),
      memberships,
      catalogs,
    ),
    repository,
    vault,
    policy,
    postgres,
    testDbms,
    unitOfWork,
    memberships,
  };
}

describe('DatabaseServiceUseCases DBMS dispatch', () => {
  it('tests unsaved details with only the requested plugin', async () => {
    const { useCases, postgres, testDbms, policy } = harnessFor();

    const result = await useCases.testUnsaved({
      connectorType: 'TEST_DBMS',
      details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
    });

    expect(result.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(testDbms.codec.normalizeCalls).toHaveLength(1);
    expect(testDbms.probe.calls).toBe(1);
    expect(postgres.codec.normalizeCalls).toHaveLength(0);
    expect(postgres.probe.calls).toBe(0);
    expect(policy.calls[0]?.engineLabel).toBe('Test DBMS');
    expect(testDbms.probe.inputSeen?.resolvedAddresses).toEqual(['10.0.0.5']);
  });

  it('creates a connection with the selected DBMS type and config', async () => {
    const { useCases, repository, postgres, testDbms } = harnessFor(undefined);

    await useCases.create({
      name: 'test connection',
      connectorType: 'TEST_DBMS',
      details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
    });

    expect(repository.created[0]?.connectorType.value).toBe('TEST_DBMS');
    expect(repository.created[0]?.config.toRecord()).toEqual({ endpoint: 'unit-test', catalog: 7 });
    expect(testDbms.codec.normalizeCalls).toHaveLength(1);
    expect(postgres.codec.normalizeCalls).toHaveLength(0);
  });

  it('updates using the stored type and never accepts a request-side type change', async () => {
    const { useCases, repository, postgres, testDbms } = harnessFor(aggregate(TEST_DBMS_TYPE));

    await useCases.update({
      id: CONNECTION_ID,
      details: { type: 'POSTGRESQL', endpoint: 'unit-test', catalog: 8 },
    });

    const normalizeCall = testDbms.codec.normalizeCalls[0] as {
      readonly input: unknown;
      readonly existing: unknown;
    };
    expect(normalizeCall.input).toEqual({ type: 'POSTGRESQL', endpoint: 'unit-test', catalog: 8 });
    expect(normalizeCall.existing).toBeInstanceOf(NormalizedConnectionConfig);
    expect(postgres.codec.normalizeCalls).toHaveLength(0);
    expect(repository.updated[0]?.connectorType.value).toBe('TEST_DBMS');
  });

  it('tests a saved connection with the plugin selected from stored type', async () => {
    const { useCases, vault, postgres, testDbms } = harnessFor(aggregate(TEST_DBMS_TYPE));

    await useCases.testSaved(CONNECTION_ID);

    expect(vault.decryptedWith).toBeDefined();
    expect(testDbms.codec.restoreCalls).toHaveLength(1);
    expect(testDbms.probe.inputSeen?.credential.value).toBe('stored-pass');
    expect(postgres.codec.restoreCalls).toHaveLength(0);
    expect(postgres.probe.calls).toBe(0);
  });

  it('converts a destination rejection into a failed unsaved test', async () => {
    const { useCases, policy, testDbms } = harnessFor();
    policy.rejection = ConnectionAccessError.destinationRejected(
      'Private addresses are not allowed.',
    );

    const result = await useCases.testUnsaved({
      connectorType: 'TEST_DBMS',
      details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
    });

    expect(result).toEqual({
      status: VerificationStatusValue.FAILED,
      testedAt: '2026-08-04T10:00:00.000Z',
      failureReason: 'Private addresses are not allowed.',
    });
    expect(testDbms.probe.calls).toBe(0);
  });

  it('preserves optimistic verification updates for saved tests', async () => {
    const { useCases, repository, unitOfWork, testDbms } = harnessFor();
    testDbms.probe.result = {
      status: VerificationStatusValue.SUCCEEDED,
      testedAt: TESTED_AT,
    };

    await useCases.testSaved(CONNECTION_ID);

    expect(repository.updated).toHaveLength(1);
    expect(repository.updated[0]?.verification.status).toBe(VerificationStatusValue.SUCCEEDED);
    expect(unitOfWork.recordedEventNames).toEqual(['ConnectionVerificationSucceeded']);
  });

  it('raises not found and malformed-id errors at the application boundary', async () => {
    const { useCases } = harnessFor(undefined);

    await expect(useCases.testSaved(CONNECTION_ID)).rejects.toThrow(
      'The connection was not found.',
    );
    await expect(useCases.testSaved('not-a-uuid')).rejects.toThrow(
      'Connection ID must be a valid UUID.',
    );
  });

  it('creates the datasource and its initial catalog membership atomically', async () => {
    const { useCases, repository, memberships } = harnessFor(undefined);

    await expect(
      useCases.create({
        name: 'test connection',
        initialDatabaseName: 'kasadata',
        connectorType: 'TEST_DBMS',
        details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
      }),
    ).resolves.toMatchObject({ databaseNames: ['kasadata'] });
    expect(repository.created).toHaveLength(1);
    expect(memberships.attached).toEqual([repository.created[0]?.id.value]);
  });

  it('rejects conflicting legacy and initial catalog database names', async () => {
    const { useCases, repository } = harnessFor(undefined);

    await expect(
      useCases.create({
        name: 'test connection',
        databaseName: 'kasadata',
        initialDatabaseName: 'analytics',
        connectorType: 'TEST_DBMS',
        details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
      }),
    ).rejects.toThrow('databaseName and initialDatabaseName must identify the same catalog database.');
    expect(repository.created).toHaveLength(0);
  });

  it('keeps the initial membership write inside the same unit of work', async () => {
    const { useCases, memberships, unitOfWork } = harnessFor(undefined);
    memberships.attachError = new Error('membership insert failed');

    await expect(
      useCases.create({
        name: 'test connection',
        initialDatabaseName: 'kasadata',
        connectorType: 'TEST_DBMS',
        details: { endpoint: 'unit-test', catalog: 7, password: 'secret' },
      }),
    ).rejects.toThrow('membership insert failed');
    expect(unitOfWork.commits).toBe(1);
    expect(unitOfWork.recorded).toEqual([]);
  });

  it('blocks archive while any catalog membership remains', async () => {
    const { useCases, memberships, repository } = harnessFor();
    memberships.any = true;

    await expect(useCases.archive(CONNECTION_ID)).rejects.toMatchObject({
      code: 'DATASOURCE_STILL_LINKED',
    });
    expect(repository.updated).toHaveLength(0);
  });

  it('archives after the last catalog membership is removed', async () => {
    const { useCases, memberships, repository } = harnessFor();
    memberships.any = false;

    await expect(useCases.archive(CONNECTION_ID)).resolves.toBeUndefined();
    expect(repository.updated).toHaveLength(1);
  });
});
