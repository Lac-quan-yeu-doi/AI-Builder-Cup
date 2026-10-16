import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import {
  ConnectionId,
  ConnectionName,
  VerificationState,
  VerificationStatusValue,
  isSuccessfulVerification,
  type VerificationOutcomeValue,
} from '@domain/database-service/value-objects/connection-value-objects';
import { FailureReason } from '@domain/database-service/value-objects/failure-reason';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import type { NormalizedConnectionDetails } from '@application/database-service/interfaces/i-connection-config-codec';
import type { ConnectionTestResult } from '@application/database-service/interfaces/i-connection-probe';
import type {
  DatabaseServiceConnector,
  IDatabaseServiceConnectorRegistry,
} from '@application/database-service/interfaces/i-database-service-connector-registry';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import {
  DEFAULT_DATABASE_SERVICE_LIST_QUERY,
  type DatabaseServiceListPage,
  type DatabaseServiceListQuery,
  type DatabaseServiceView,
} from '@application/database-service/read-models/database-service.view';
import type { DatabaseServiceConnectorDescriptor } from '@application/database-service/read-models/database-service-connector-descriptor';
import { toDatabaseServiceView } from '@application/database-service/read-models/database-service.projection';
import { toConnectionOutboxMessage } from '@application/database-service/connection-outbox.mapper';
import {
  ConnectionAccessError,
  ConnectionAccessErrorCode,
} from '@application/database-service/errors/connection-access.error';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

export interface CreateDatabaseServiceCommand {
  readonly name: string;
  /** Iceberg database the source is filed under; omitted when created outside one. */
  readonly databaseName?: string;
  /** Preferred name for the initial catalog membership. */
  readonly initialDatabaseName?: string;
  readonly connectorType: string;
  readonly details: unknown;
}

export interface UpdateDatabaseServiceCommand {
  readonly id: string;
  readonly name?: string;
  readonly details?: unknown;
}

export interface TestUnsavedDatabaseServiceCommand {
  readonly connectorType: string;
  readonly details: unknown;
}

/** @deprecated Use the Database Service names at new call sites. */
export type CreateConnectionCommand = CreateDatabaseServiceCommand;
/** @deprecated Use the Database Service names at new call sites. */
export type UpdateConnectionCommand = UpdateDatabaseServiceCommand;
/** @deprecated Use the Database Service names at new call sites. */
export type TestUnsavedConnectionCommand = TestUnsavedDatabaseServiceCommand;

export interface ConnectionVerificationView {
  readonly status: VerificationOutcomeValue;
  readonly testedAt: string;
  readonly failureReason?: string;
}

/**
 * Application service for the Connection Registry context.
 *
 * This context previously stood apart from the other four in three ways, all of
 * which were accidents of it having been written first:
 *
 *  - it called `new Date()` and `randomUUID()` directly instead of using the
 *    {@link IClock} and {@link IIdGenerator} ports its siblings inject, so its
 *    behaviour could not be pinned down in a test;
 *  - it wrote through a repository `save` that upserted outside any transaction;
 *  - and although {@link DatabaseService} raises five domain events, nothing ever
 *    collected them. `pullDomainEvents` was never called, so every event was
 *    built, pushed onto an array, and garbage collected. The registry was the one
 *    context publishing nothing.
 *
 * All three are addressed here: the ports are injected, writes go through a unit
 * of work, and the events reach the outbox alongside the row that caused them.
 */
export class DatabaseServiceUseCases {
  public constructor(
    private readonly repository: IDatabaseServiceRepository,
    private readonly reader: IDatabaseServiceReader,
    private readonly credentialVault: ICredentialVault,
    private readonly plugins: IDatabaseServiceConnectorRegistry,
    private readonly destinationPolicy: IDestinationPolicy,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly memberships: IDatabaseServiceMembershipRepository,
    private readonly catalogs: IDatabaseCatalogReader,
  ) {}

  public list(
    query: DatabaseServiceListQuery = DEFAULT_DATABASE_SERVICE_LIST_QUERY,
  ): Promise<DatabaseServiceListPage> {
    return this.reader.listActive(query);
  }

  public async get(id: string): Promise<DatabaseServiceView> {
    ConnectionId.from(id);
    const connection = await this.reader.findActiveById(id);
    if (connection === undefined) {
      throw ConnectionError.notFound();
    }
    return connection;
  }

  public listConnectors(): readonly DatabaseServiceConnectorDescriptor[] {
    return this.plugins.list?.() ?? [];
  }

  public async create(command: CreateDatabaseServiceCommand): Promise<DatabaseServiceView> {
    const name = ConnectionName.create(command.name);
    const initialDatabaseName = resolveInitialDatabaseName(command);
    if (initialDatabaseName !== undefined && !(await this.catalogs.exists(initialDatabaseName))) {
      throw ConnectionError.databaseNotFound();
    }
    if (await this.repository.existsByName(name)) {
      throw ConnectionError.nameConflict();
    }

    const connectorType = ConnectorType.create(command.connectorType);
    const plugin = this.plugins.require(connectorType);
    const normalized = plugin.configCodec.normalize(command.details);
    const credential = requireCredential(normalized.credential);
    await this.destinationPolicy.resolveAllowed(normalized.destination);
    const encryptedCredential = await this.credentialVault.encrypt(credential.value);
    const now = this.clock.now();
    const connection = DatabaseService.register(
      {
        id: ConnectionId.from(this.idGenerator.next()),
        name,
        connectorType,
        config: normalized.config,
        credential: encryptedCredential,
        credentialSchemaVersion: credential.schemaVersion,
        verification: VerificationState.untested(),
        createdAt: now,
        updatedAt: now,
      },
      this.idGenerator.next(),
    );

    await this.unitOfWork.commit(async (events) => {
      await this.repository.create(connection);
      if (initialDatabaseName !== undefined) {
        await this.memberships.attach(connection.id.value, initialDatabaseName, now);
      }
      events.record(...connection.pullDomainEvents().map(toConnectionOutboxMessage));
    });
    return {
      ...toDatabaseServiceView(connection),
      databaseNames: initialDatabaseName === undefined ? [] : [initialDatabaseName],
    };
  }

  public async update(command: UpdateDatabaseServiceCommand): Promise<DatabaseServiceView> {
    const connection = await this.requireAggregate(command.id);
    const expectedUpdatedAt = connection.updatedAt;
    const name = command.name === undefined ? connection.name : ConnectionName.create(command.name);
    if (await this.repository.existsByName(name, connection.id)) {
      throw ConnectionError.nameConflict();
    }

    const plugin = this.plugins.require(connection.connectorType);
    const normalized =
      command.details === undefined
        ? undefined
        : plugin.configCodec.normalize(command.details, connection.config);
    const nextConfig = normalized?.config ?? connection.config;
    if (!nextConfig.equals(connection.config)) {
      await this.destinationPolicy.resolveAllowed(normalized!.destination);
    }
    const nextCredential =
      normalized?.credential === undefined
        ? connection.credential
        : await this.credentialVault.encrypt(normalized.credential.value);
    const nextCredentialSchemaVersion =
      normalized?.credential?.schemaVersion ?? connection.credentialSchemaVersion;

    const changed = connection.change({
      name,
      config: nextConfig,
      credential: nextCredential,
      credentialSchemaVersion: nextCredentialSchemaVersion,
      changedAt: this.clock.now(),
      eventId: this.idGenerator.next(),
    });
    if (!changed) {
      return toDatabaseServiceView(connection);
    }

    await this.persistChange(connection, expectedUpdatedAt, () => ConnectionError.nameConflict());
    return toDatabaseServiceView(connection);
  }

  public async archive(id: string): Promise<void> {
    const connection = await this.requireAggregate(id);
    const expectedUpdatedAt = connection.updatedAt;
    connection.archive(this.clock.now(), this.idGenerator.next());
    await this.unitOfWork.commit(async (events) => {
      if (await this.memberships.hasAny(connection.id.value)) {
        throw ConnectionError.datasourceStillLinked();
      }
      if (!(await this.repository.update(connection, expectedUpdatedAt))) {
        throw ConnectionError.archived();
      }
      events.record(...connection.pullDomainEvents().map(toConnectionOutboxMessage));
    });
  }

  public async testUnsaved(
    command: TestUnsavedDatabaseServiceCommand,
  ): Promise<ConnectionVerificationView> {
    const connectorType = ConnectorType.create(command.connectorType);
    const plugin = this.plugins.require(connectorType);
    const normalized = plugin.configCodec.normalize(command.details);
    const result = await this.testDetails(
      plugin,
      normalized,
      requireCredential(normalized.credential),
    );
    return this.toVerificationView(result);
  }

  public async testSaved(id: string): Promise<ConnectionVerificationView> {
    const connection = await this.requireAggregate(id);
    const expectedUpdatedAt = connection.updatedAt;
    const plugin = this.plugins.require(connection.connectorType);
    const password = await this.credentialVault.decrypt(connection.credential);
    const restored = plugin.configCodec.restore(connection.config);
    const credential = PlaintextCredentialPayload.create(
      connection.credentialSchemaVersion,
      password,
    );
    const result = await this.testDetails(plugin, restored, credential);

    if (isSuccessfulVerification(result.status)) {
      connection.recordVerificationSuccess(result.testedAt, this.idGenerator.next());
    } else {
      connection.recordVerificationFailure(
        result.testedAt,
        this.failureReason(result.failureReason),
        this.idGenerator.next(),
      );
    }
    await this.persistChange(connection, expectedUpdatedAt, () =>
      ConnectionError.changedDuringTest(),
    );
    return this.toVerificationView(result);
  }

  /**
   * Commits a change together with the events it raised, translating a lost guard
   * into the error that fits the operation.
   *
   * The guard can only be lost one way — another writer moved the row since it was
   * loaded — but what that means to the caller differs: a failed verification save
   * means "the connection changed while we were testing it", a failed archive means
   * "someone else already archived it". So the error is a parameter.
   */
  private async persistChange(
    connection: DatabaseService,
    expectedUpdatedAt: Date,
    onConflict: () => ConnectionError,
  ): Promise<void> {
    await this.unitOfWork.commit(async (events) => {
      if (!(await this.repository.update(connection, expectedUpdatedAt))) {
        throw onConflict();
      }
      events.record(...connection.pullDomainEvents().map(toConnectionOutboxMessage));
    });
  }

  private async requireAggregate(idValue: string): Promise<DatabaseService> {
    const id = ConnectionId.from(idValue);
    const connection = await this.repository.findById(id);
    if (connection === undefined) {
      throw ConnectionError.notFound();
    }
    if (connection.isArchived) {
      throw ConnectionError.archived();
    }
    return connection;
  }

  private async testDetails(
    plugin: DatabaseServiceConnector,
    details: NormalizedConnectionDetails,
    credential: PlaintextCredentialPayload,
  ): Promise<ConnectionTestResult> {
    let resolvedAddresses: readonly string[];
    try {
      const destination = await this.destinationPolicy.resolveAllowed(details.destination);
      resolvedAddresses = destination.addresses;
    } catch (error: unknown) {
      if (ConnectionAccessError.is(error, ConnectionAccessErrorCode.DESTINATION_REJECTED)) {
        // A rejected destination is a failed test, not a failed request: the
        // caller asked whether the connection works, and the answer is no.
        return {
          status: VerificationStatusValue.FAILED,
          testedAt: this.clock.now(),
          failureReason: this.failureReason(error.message),
        };
      }
      throw error;
    }

    return plugin.probe.test({
      config: details.config,
      resolvedAddresses,
      credential,
    });
  }

  private failureReason(reason: string | undefined): string {
    return FailureReason.from(reason).value;
  }

  private toVerificationView(result: ConnectionTestResult): ConnectionVerificationView {
    return {
      status: result.status,
      testedAt: result.testedAt.toISOString(),
      failureReason: isSuccessfulVerification(result.status)
        ? undefined
        : this.failureReason(result.failureReason),
    };
  }
}

function requireCredential(
  credential: PlaintextCredentialPayload | undefined,
): PlaintextCredentialPayload {
  if (credential === undefined) {
    throw ConnectionError.validation(ConnectionMessage.credentialRequired);
  }
  return credential;
}

/**
 * A blank database name means "no database", not a database called nothing.
 * The value names a Trino namespace, so it is stored as given rather than
 * validated here — the catalog is the only place that knows what exists.
 */
function cleanDatabaseName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function resolveInitialDatabaseName(command: CreateDatabaseServiceCommand): string | undefined {
  const legacyName = cleanDatabaseName(command.databaseName);
  const initialName = cleanDatabaseName(command.initialDatabaseName);
  if (legacyName !== undefined && initialName !== undefined && legacyName !== initialName) {
    throw ConnectionError.validation(
      'databaseName and initialDatabaseName must identify the same catalog database.',
    );
  }
  return initialName ?? legacyName;
}
