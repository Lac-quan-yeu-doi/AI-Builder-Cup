import {
  ConnectionAccessError,
  ConnectionAccessErrorCode,
} from '@application/database-service/errors/connection-access.error';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type {
  DatabaseServiceConnector,
  IDatabaseServiceConnectorRegistry,
} from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IExecutionConnectionAdapter } from '@application/database-service/interfaces/i-execution-connection-adapter';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type {
  DatabaseServiceListPage,
  DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { ConnectionExecutionProfileProvider } from '@infrastructure/providers/database-service/connection-execution-profile.provider';
import { ConnectionReferenceProvider } from '@infrastructure/providers/database-service/connection-reference.provider';

/**
 * Covers the two adapters Task 6 moved out of the application layer. Fakes stand
 * in for the repository, vault, and reader; nothing here touches a database.
 */

const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

function credential(): CredentialReference {
  return CredentialReference.create({
    ciphertext: 'cipher',
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function aggregate(
  overrides: {
    readonly archivedAt?: Date;
    readonly credentialSchemaVersion?: number;
    readonly connectorType?: string;
  } = {},
): DatabaseService {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return DatabaseService.rehydrate({
    id: ConnectionId.from(CONNECTION_ID),
    name: ConnectionName.create('analytics'),
    connectorType: ConnectorType.create(overrides.connectorType ?? 'TEST_DBMS'),
    config: NormalizedConnectionConfig.create(1, {
      catalog: 7,
      endpoint: 'unit-test',
      transport: { mode: 'memory' },
    }),
    credential: credential(),
    credentialSchemaVersion: overrides.credentialSchemaVersion ?? 7,
    verification: VerificationState.untested(),
    archivedAt: overrides.archivedAt,
    createdAt: now,
    updatedAt: now,
  });
}

function view(): DatabaseServiceView {
  return {
    id: CONNECTION_ID,
    name: 'analytics',
    databaseNames: [],
    connectorType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {
      databaseName: 'analytics',
      host: 'db.internal',
      options: {},
      port: 6432,
      sslMode: 'require',
      username: 'alice',
    },
    summary: [],
    verificationStatus: VerificationStatusValue.UNTESTED,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

class FakeRepository implements IDatabaseServiceRepository {
  public idsRequested: string[] = [];

  public constructor(private readonly stored: DatabaseService | undefined) {}

  public findById(id: ConnectionId): Promise<DatabaseService | undefined> {
    this.idsRequested.push(id.value);
    return Promise.resolve(this.stored);
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

class FakeReader implements IDatabaseServiceReader {
  public idsRequested: string[] = [];

  public constructor(private readonly found: DatabaseServiceView | undefined) {}

  public listActive(): Promise<DatabaseServiceListPage> {
    return Promise.resolve({
      items: this.found === undefined ? [] : [this.found],
      page: 1,
      pageSize: 50,
      total: this.found === undefined ? 0 : 1,
    });
  }

  public findActiveById(id: string): Promise<DatabaseServiceView | undefined> {
    this.idsRequested.push(id);
    return Promise.resolve(this.found);
  }
}

class FakeVault implements ICredentialVault {
  public decryptCalls = 0;

  public encrypt(): Promise<CredentialReference> {
    return Promise.resolve(credential());
  }

  public decrypt(): Promise<string> {
    this.decryptCalls += 1;
    return Promise.resolve('decrypted-pass');
  }
}

class FakeExecutionAdapter implements IExecutionConnectionAdapter {
  public readonly calls: {
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
      secretOptions: { TEST_PASSWORD: credential.value },
    });
  }
}

class FakePluginRegistry implements IDatabaseServiceConnectorRegistry {
  public readonly required: string[] = [];

  public constructor(private readonly executionAdapter: IExecutionConnectionAdapter) {}

  public require(connectorType: ConnectorType): DatabaseServiceConnector {
    this.required.push(connectorType.value);
    return {
      connectorType,
      configCodec: {} as never,
      probe: {} as never,
      executionAdapter: this.executionAdapter,
    };
  }
}

describe('ConnectionReferenceProvider', () => {
  it('returns the reference for an active connection', async () => {
    const reader = new FakeReader(view());

    await expect(
      new ConnectionReferenceProvider(reader).requireActive(CONNECTION_ID),
    ).resolves.toEqual({ id: CONNECTION_ID });
    expect(reader.idsRequested).toEqual([CONNECTION_ID]);
  });

  it('rejects a malformed identifier before touching the reader', async () => {
    const reader = new FakeReader(view());
    const provider = new ConnectionReferenceProvider(reader);

    await expect(provider.requireActive('not-a-uuid')).rejects.toThrow(
      'Connection ID must be a valid UUID.',
    );
    expect(reader.idsRequested).toEqual([]);
  });

  it('raises INVALID_ID for a malformed identifier', async () => {
    const provider = new ConnectionReferenceProvider(new FakeReader(view()));

    await expect(provider.requireActive('not-a-uuid')).rejects.toMatchObject({
      code: ConnectionAccessErrorCode.INVALID_ID,
    });
  });

  it('raises NOT_FOUND when the read model has no active row', async () => {
    const provider = new ConnectionReferenceProvider(new FakeReader(undefined));

    await expect(provider.requireActive(CONNECTION_ID)).rejects.toMatchObject({
      code: ConnectionAccessErrorCode.NOT_FOUND,
    });
    await expect(provider.requireActive(CONNECTION_ID)).rejects.toThrow(
      'The selected active connection was not found.',
    );
  });

  it('raises a ConnectionAccessError, not a domain error', async () => {
    const provider = new ConnectionReferenceProvider(new FakeReader(undefined));

    await expect(provider.requireActive(CONNECTION_ID)).rejects.toBeInstanceOf(
      ConnectionAccessError,
    );
  });
});

describe('ConnectionExecutionProfileProvider', () => {
  it('dispatches the stored DBMS to its execution adapter', async () => {
    const vault = new FakeVault();
    const adapter = new FakeExecutionAdapter();
    const plugins = new FakePluginRegistry(adapter);
    const provider = new ConnectionExecutionProfileProvider(
      new FakeRepository(aggregate({ credentialSchemaVersion: 7 })),
      vault,
      plugins,
    );

    const descriptor = await provider.resolveExecutionProfile(CONNECTION_ID);

    expect(descriptor.driverClass).toBe('example.TestDriver');
    expect(descriptor.jdbcUrl).toBe('jdbc:test:unit-test/7');
    expect(plugins.required).toEqual(['TEST_DBMS']);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.config.toRecord()).toMatchObject({
      endpoint: 'unit-test',
      catalog: 7,
    });
    expect(adapter.calls[0]?.credential).toEqual(
      PlaintextCredentialPayload.create(7, 'decrypted-pass'),
    );
    expect(vault.decryptCalls).toBe(1);
  });

  it('keeps the decrypted credential out of descriptor serialization', async () => {
    const adapter = new FakeExecutionAdapter();
    const provider = new ConnectionExecutionProfileProvider(
      new FakeRepository(aggregate()),
      new FakeVault(),
      new FakePluginRegistry(adapter),
    );

    const descriptor = await provider.resolveExecutionProfile(CONNECTION_ID);

    expect(JSON.stringify(descriptor)).not.toContain('decrypted-pass');
    expect(JSON.stringify(descriptor)).toContain('[REDACTED]');
  });

  it('rejects a malformed identifier before touching the repository', async () => {
    const repository = new FakeRepository(aggregate());
    const provider = new ConnectionExecutionProfileProvider(
      repository,
      new FakeVault(),
      new FakePluginRegistry(new FakeExecutionAdapter()),
    );

    await expect(provider.resolveExecutionProfile('not-a-uuid')).rejects.toMatchObject({
      code: ConnectionAccessErrorCode.INVALID_ID,
    });
    expect(repository.idsRequested).toEqual([]);
  });

  it('raises NOT_FOUND for an unknown connection', async () => {
    const provider = new ConnectionExecutionProfileProvider(
      new FakeRepository(undefined),
      new FakeVault(),
      new FakePluginRegistry(new FakeExecutionAdapter()),
    );

    await expect(provider.resolveExecutionProfile(CONNECTION_ID)).rejects.toMatchObject({
      code: ConnectionAccessErrorCode.NOT_FOUND,
    });
  });

  it('raises NOT_FOUND for an archived connection rather than exposing it', async () => {
    const archived = aggregate({ archivedAt: new Date('2026-08-02T00:00:00.000Z') });
    const provider = new ConnectionExecutionProfileProvider(
      new FakeRepository(archived),
      new FakeVault(),
      new FakePluginRegistry(new FakeExecutionAdapter()),
    );

    await expect(provider.resolveExecutionProfile(CONNECTION_ID)).rejects.toMatchObject({
      code: ConnectionAccessErrorCode.NOT_FOUND,
    });
  });

  it('never decrypts the credential of an archived connection', async () => {
    const vault = new FakeVault();
    const provider = new ConnectionExecutionProfileProvider(
      new FakeRepository(aggregate({ archivedAt: new Date('2026-08-02T00:00:00.000Z') })),
      vault,
      new FakePluginRegistry(new FakeExecutionAdapter()),
    );

    await expect(provider.resolveExecutionProfile(CONNECTION_ID)).rejects.toBeInstanceOf(
      ConnectionAccessError,
    );
    expect(vault.decryptCalls).toBe(0);
  });
});
