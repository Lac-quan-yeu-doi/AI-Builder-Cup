import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
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
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type {
  IDestinationPolicy,
  ResolvedDestination,
} from '@application/database-service/interfaces/i-destination-policy';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import { ConnectionExecutionProfileProvider } from '@infrastructure/providers/database-service/connection-execution-profile.provider';
import type { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  CredentialReference,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { FixedClock, SequentialIdGenerator } from '@tests/support/deterministic-ports';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';

const TEST_TYPE = ConnectorType.create('TEST_DBMS');
const POSTGRES_TYPE = ConnectorType.create('POSTGRESQL');
const TESTED_AT = new Date('2026-08-06T10:00:00.000Z');
const TEST_CONFIG = NormalizedConnectionConfig.create(1, {
  catalog: 7,
  endpoint: 'unit-test',
  transport: { mode: 'memory' },
});

class TestCodec implements IConnectionConfigCodec {
  public readonly normalizeCalls: unknown[] = [];
  public readonly restoreCalls: NormalizedConnectionConfig[] = [];

  public normalize(
    input: unknown,
    existing?: NormalizedConnectionConfig,
  ): NormalizedConnectionDetails {
    this.normalizeCalls.push({ input, existing });
    if (
      !isRecord(input) ||
      typeof input.endpoint !== 'string' ||
      typeof input.catalog !== 'number'
    ) {
      throw new Error('Unexpected TEST_DBMS payload.');
    }
    const token = input.token;
    if (token !== undefined && typeof token !== 'string') {
      throw new Error('Unexpected TEST_DBMS credential payload.');
    }
    return {
      config: existing ?? TEST_CONFIG,
      destination: { host: 'unit-test', port: 1000, engineLabel: 'Test DBMS' },
      credential: token === undefined ? undefined : PlaintextCredentialPayload.create(7, token),
    };
  }

  public restore(
    config: NormalizedConnectionConfig,
  ): Omit<NormalizedConnectionDetails, 'credential'> {
    this.restoreCalls.push(config);
    return {
      config,
      destination: { host: 'unit-test', port: 1000, engineLabel: 'Test DBMS' },
    };
  }
}

class TestProbe implements IConnectionProbe {
  public calls = 0;
  public lastInput: Parameters<IConnectionProbe['test']>[0] | undefined;

  public test(input: Parameters<IConnectionProbe['test']>[0]): Promise<ConnectionTestResult> {
    this.calls += 1;
    this.lastInput = input;
    return Promise.resolve({ status: VerificationStatusValue.SUCCEEDED, testedAt: TESTED_AT });
  }
}

class TestExecutionAdapter implements IExecutionConnectionAdapter {
  public calls: {
    readonly config: NormalizedConnectionConfig;
    readonly credential: PlaintextCredentialPayload;
  }[] = [];

  public build(
    config: NormalizedConnectionConfig,
    credential: PlaintextCredentialPayload,
  ): ExecutionConnectionDescriptor {
    this.calls.push({ config, credential });
    return ExecutionConnectionDescriptor.create({
      driverClass: 'example.TestDriver',
      jdbcUrl: 'jdbc:test:unit-test/7',
      publicOptions: { TEST_ENDPOINT: 'unit-test' },
      secretOptions: { TEST_TOKEN: credential.value },
    });
  }
}

class NeverCalledCodec implements IConnectionConfigCodec {
  public normalize(): never {
    throw new Error('PostgreSQL codec was selected.');
  }

  public restore(): never {
    throw new Error('PostgreSQL codec was selected.');
  }
}

class NeverCalledProbe implements IConnectionProbe {
  public calls = 0;

  public test(): never {
    this.calls += 1;
    throw new Error('PostgreSQL probe was selected.');
  }
}

class NeverCalledExecutionAdapter implements IExecutionConnectionAdapter {
  public calls = 0;

  public build(): never {
    this.calls += 1;
    throw new Error('PostgreSQL execution adapter was selected.');
  }
}

class TestPluginRegistry implements IDatabaseServiceConnectorRegistry {
  public readonly required: string[] = [];

  public constructor(private readonly plugins: readonly DatabaseServiceConnector[]) {}

  public require(connectorType: ConnectorType): DatabaseServiceConnector {
    this.required.push(connectorType.value);
    const plugin = this.plugins.find((candidate) => candidate.connectorType.equals(connectorType));
    if (plugin === undefined) {
      throw new Error(`Unsupported database type: ${connectorType.value}.`);
    }
    return plugin;
  }
}

class TestRepository implements IDatabaseServiceRepository {
  public stored: DatabaseService | undefined;
  public readonly created: DatabaseService[] = [];

  public findById(): Promise<DatabaseService | undefined> {
    return Promise.resolve(this.stored);
  }

  public existsByName(): Promise<boolean> {
    return Promise.resolve(false);
  }

  public create(connection: DatabaseService): Promise<void> {
    this.created.push(connection);
    this.stored = connection;
    return Promise.resolve();
  }

  public update(connection: DatabaseService): Promise<boolean> {
    this.stored = connection;
    return Promise.resolve(true);
  }
}

class TestReader implements IDatabaseServiceReader {
  public listActive(): Promise<DatabaseServiceListPage> {
    return Promise.resolve({ items: [], page: 1, pageSize: 50, total: 0 });
  }

  public findActiveById(): Promise<DatabaseServiceView | undefined> {
    return Promise.resolve(undefined);
  }
}

class TestVault implements ICredentialVault {
  public decryptCalls = 0;

  public encrypt(value: string): Promise<CredentialReference> {
    return Promise.resolve(
      CredentialReference.create({
        ciphertext: `encrypted:${value}`,
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      }),
    );
  }

  public decrypt(): Promise<string> {
    this.decryptCalls += 1;
    return Promise.resolve('stored-token');
  }
}

class TestDestinationPolicy implements IDestinationPolicy {
  public resolveAllowed(destination: ResolvedDestination): Promise<ResolvedDestination> {
    return Promise.resolve({ ...destination, addresses: ['10.0.0.5'] });
  }
}

class NoopMembershipRepository implements IDatabaseServiceMembershipRepository {
  public listDatabaseNames(): Promise<readonly string[]> { return Promise.resolve([]); }
  public listDatabaseServiceIds(): Promise<readonly string[]> { return Promise.resolve([]); }
  public exists(): Promise<boolean> { return Promise.resolve(false); }
  public hasAny(): Promise<boolean> { return Promise.resolve(false); }
  public lockExisting(): Promise<boolean> { return Promise.resolve(false); }
  public attach(): Promise<void> { return Promise.resolve(); }
  public detach(): Promise<void> { return Promise.resolve(); }
}

class AlwaysPresentCatalog implements IDatabaseCatalogReader {
  public exists(): Promise<boolean> { return Promise.resolve(true); }
}

function plugin(
  connectorType: ConnectorType,
  configCodec: IConnectionConfigCodec,
  probe: IConnectionProbe,
  executionAdapter: IExecutionConnectionAdapter,
): DatabaseServiceConnector {
  return { connectorType, configCodec, probe, executionAdapter };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('multi-DBMS extension contract', () => {
  it('traverses lifecycle and execution selection without PostgreSQL capability calls', async () => {
    const testCodec = new TestCodec();
    const testProbe = new TestProbe();
    const testExecutionAdapter = new TestExecutionAdapter();
    const postgresCodec = new NeverCalledCodec();
    const postgresProbe = new NeverCalledProbe();
    const postgresExecutionAdapter = new NeverCalledExecutionAdapter();
    const plugins = new TestPluginRegistry([
      plugin(TEST_TYPE, testCodec, testProbe, testExecutionAdapter),
      plugin(POSTGRES_TYPE, postgresCodec, postgresProbe, postgresExecutionAdapter),
    ]);
    const repository = new TestRepository();
    const vault = new TestVault();
    const useCases = new DatabaseServiceUseCases(
      repository,
      new TestReader(),
      vault,
      plugins,
      new TestDestinationPolicy(),
      new FakeUnitOfWork(),
      new FixedClock(),
      new SequentialIdGenerator(),
      new NoopMembershipRepository(),
      new AlwaysPresentCatalog(),
    );

    await expect(
      useCases.testUnsaved({
        connectorType: TEST_TYPE.value,
        details: { endpoint: 'unit-test', catalog: 7, token: 'unsaved-token' },
      }),
    ).resolves.toMatchObject({ status: VerificationStatusValue.SUCCEEDED });
    expect(testProbe.calls).toBe(1);
    expect(testProbe.lastInput?.credential.value).toBe('unsaved-token');

    const created = await useCases.create({
      name: 'test connection',
      connectorType: TEST_TYPE.value,
      details: { endpoint: 'unit-test', catalog: 7, token: 'stored-token' },
    });
    expect(created.connectorType).toBe(TEST_TYPE.value);
    expect(created.config).toEqual(TEST_CONFIG.toRecord());
    expect(repository.created[0]?.credentialSchemaVersion).toBe(7);

    await useCases.testSaved(created.id);
    expect(testCodec.restoreCalls).toHaveLength(1);
    expect(testProbe.lastInput?.credential.value).toBe('stored-token');

    const provider = new ConnectionExecutionProfileProvider(repository, vault, plugins);
    const descriptor = await provider.resolveExecutionProfile(created.id);
    expect(descriptor.driverClass).toBe('example.TestDriver');
    expect(descriptor.jdbcUrl).toBe('jdbc:test:unit-test/7');
    expect(testExecutionAdapter.calls[0]?.credential.schemaVersion).toBe(7);
    expect(vault.decryptCalls).toBe(2);

    expect(plugins.required).toEqual([
      TEST_TYPE.value,
      TEST_TYPE.value,
      TEST_TYPE.value,
      TEST_TYPE.value,
    ]);
    expect(postgresCodec).toBeDefined();
    expect(postgresProbe.calls).toBe(0);
    expect(postgresExecutionAdapter.calls).toBe(0);
  });
});
