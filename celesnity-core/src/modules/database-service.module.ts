import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseServiceUseCases } from '@application/database-service/database-service.use-cases';
import { DatabaseServiceMembershipUseCases } from '@application/database-service/database-service-membership.use-cases';
import { CdcConnectionProfileUseCases } from '@application/database-service/cdc-connection-profile.use-cases';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { ICdcConnectionPreflight } from '@application/database-service/interfaces/i-cdc-connection-preflight';
import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { ICdcConnectionUsageReader } from '@application/database-service/interfaces/i-cdc-connection-usage-reader';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDatabaseServiceMembershipRepository } from '@application/database-service/interfaces/i-database-service-membership-repository';
import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import type { IDatabaseSourceUsageReader } from '@application/database-service/interfaces/i-database-source-usage-reader';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import {
  CONNECTION_EXECUTION_PROFILE_PROVIDER,
  CONNECTION_REFERENCE_PROVIDER,
  CREDENTIAL_VAULT,
  DATABASE_SERVICE_READER,
  DATABASE_SERVICE_REPOSITORY,
  DATABASE_SERVICE_MEMBERSHIP_REPOSITORY,
  DATABASE_CATALOG_READER,
  DATABASE_SOURCE_USAGE_READER,
  DESTINATION_POLICY,
  DATABASE_SERVICE_CONNECTOR_REGISTRY,
  DATABASE_SERVICE_RUNTIME_PROVIDER,
  CDC_CONNECTION_PREFLIGHT,
  CDC_CONNECTION_PROFILE_REPOSITORY,
  CDC_CONNECTION_USAGE_READER,
  CDC_CONNECTION_RUNTIME_PROVIDER,
} from '@application/database-service/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaDatabaseServiceReader } from '@infrastructure/prisma/database-service/prisma-database-service.reader';
import { DatabaseServiceMapper } from '@infrastructure/prisma/database-service/database-service.mapper';
import { PrismaDatabaseServiceRepository } from '@infrastructure/prisma/database-service/prisma-database-service.repository';
import { PrismaDatabaseServiceMembershipRepository } from '@infrastructure/prisma/database-service/prisma-database-service-membership.repository';
import { PrismaDatabaseSourceUsageReader } from '@infrastructure/prisma/database-service/prisma-database-source-usage.reader';
import { CdcConnectionProfileMapper } from '@infrastructure/prisma/database-service/cdc-connection-profile.mapper';
import { PrismaCdcConnectionProfileRepository } from '@infrastructure/prisma/database-service/prisma-cdc-connection-profile.repository';
import { PrismaCdcConnectionUsageReader } from '@infrastructure/prisma/database-service/prisma-cdc-connection-usage.reader';
import { ConnectionExecutionProfileProvider } from '@infrastructure/providers/database-service/connection-execution-profile.provider';
import { DatabaseServiceRuntimeProvider } from '@infrastructure/providers/database-service/database-service-runtime.provider';
import { CdcConnectionPreflightAdapter } from '@infrastructure/providers/database-service/cdc-connection-preflight.adapter';
import { CdcConnectionRuntimeProvider } from '@infrastructure/providers/database-service/cdc-connection-runtime.provider';
import { ConnectionReferenceProvider } from '@infrastructure/providers/database-service/connection-reference.provider';
import { Aes256GcmCredentialVault } from '@infrastructure/security/database-service/aes-256-gcm-credential-vault';
import { NetworkDestinationPolicy } from '@infrastructure/dbms/shared/network-destination.policy';
import { DatabaseServiceConnectorRegistry } from '@infrastructure/dbms/registry/database-service-connector.registry';
import { FTPS_CONNECTOR_DESCRIPTOR } from '@application/ftps-connector/read-models/ftps-connector.descriptor';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresConnectionProbe } from '@infrastructure/dbms/postgresql/postgres-connection.probe';
import { PostgresExecutionAdapter } from '@infrastructure/dbms/postgresql/postgres-execution.adapter';
import { createPostgresPlugin } from '@infrastructure/dbms/postgresql/postgres.plugin';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlConnectionProbe } from '@infrastructure/dbms/mysql/mysql-connection.probe';
import { MysqlExecutionAdapter } from '@infrastructure/dbms/mysql/mysql-execution.adapter';
import { createMysqlPlugin } from '@infrastructure/dbms/mysql/mysql.plugin';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { DatabaseServiceController } from '@presentation/database-service/database-service.controller';
import { DatabaseServiceMembershipController } from '@presentation/database-service/database-service-membership.controller';
import { CdcConnectionProfileController } from '@presentation/database-service/cdc-connection-profile.controller';
import { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';
import { DatabaseCatalogReader } from '@infrastructure/providers/database-service/database-catalog.reader';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';

@Module({
  imports: [CatalogExplorationModule],
  controllers: [
    DatabaseServiceMembershipController,
    DatabaseServiceController,
    CdcConnectionProfileController,
  ],
  providers: [
    DatabaseServiceMapper,
    CdcConnectionProfileMapper,
    PrismaDatabaseServiceRepository,
    PrismaDatabaseServiceMembershipRepository,
    PrismaDatabaseSourceUsageReader,
    PrismaDatabaseServiceReader,
    DatabaseCatalogReader,
    PrismaCdcConnectionProfileRepository,
    PrismaCdcConnectionUsageReader,
    Aes256GcmCredentialVault,
    NetworkDestinationPolicy,
    PostgresConfigCodec,
    MysqlConfigCodec,
    ConnectionReferenceProvider,
    ConnectionExecutionProfileProvider,
    DatabaseServiceRuntimeProvider,
    CdcConnectionPreflightAdapter,
    CdcConnectionRuntimeProvider,
    { provide: CdcSourcePreflight, useFactory: (): CdcSourcePreflight => new CdcSourcePreflight() },
    SystemClock,
    RandomUuidGenerator,
    // Every port binds to an `@Injectable` adapter the same way.
    { provide: DATABASE_SERVICE_REPOSITORY, useExisting: PrismaDatabaseServiceRepository },
    {
      provide: DATABASE_SERVICE_MEMBERSHIP_REPOSITORY,
      useExisting: PrismaDatabaseServiceMembershipRepository,
    },
    { provide: DATABASE_CATALOG_READER, useExisting: DatabaseCatalogReader },
    { provide: DATABASE_SOURCE_USAGE_READER, useExisting: PrismaDatabaseSourceUsageReader },
    { provide: DATABASE_SERVICE_READER, useExisting: PrismaDatabaseServiceReader },
    { provide: CREDENTIAL_VAULT, useExisting: Aes256GcmCredentialVault },
    {
      provide: CDC_CONNECTION_PROFILE_REPOSITORY,
      useExisting: PrismaCdcConnectionProfileRepository,
    },
    { provide: CDC_CONNECTION_USAGE_READER, useExisting: PrismaCdcConnectionUsageReader },
    { provide: CDC_CONNECTION_PREFLIGHT, useExisting: CdcConnectionPreflightAdapter },
    {
      provide: CDC_CONNECTION_RUNTIME_PROVIDER,
      useExisting: CdcConnectionRuntimeProvider,
    },
    { provide: DESTINATION_POLICY, useExisting: NetworkDestinationPolicy },
    {
      provide: PostgresConnectionProbe,
      inject: [ConfigService, PostgresConfigCodec],
      useFactory: (config: ConfigService, codec: PostgresConfigCodec): PostgresConnectionProbe =>
        new PostgresConnectionProbe(codec, {
          timeoutMilliseconds: config.getOrThrow<number>('CONNECTION_TEST_TIMEOUT_MS'),
        }),
    },
    {
      provide: PostgresExecutionAdapter,
      inject: [PostgresConfigCodec],
      useFactory: (codec: PostgresConfigCodec): PostgresExecutionAdapter =>
        new PostgresExecutionAdapter(codec),
    },
    {
      provide: MysqlConnectionProbe,
      inject: [ConfigService, MysqlConfigCodec],
      useFactory: (config: ConfigService, codec: MysqlConfigCodec): MysqlConnectionProbe =>
        new MysqlConnectionProbe(codec, {
          timeoutMilliseconds: config.getOrThrow<number>('CONNECTION_TEST_TIMEOUT_MS'),
        }),
    },
    {
      provide: MysqlExecutionAdapter,
      inject: [MysqlConfigCodec],
      useFactory: (codec: MysqlConfigCodec): MysqlExecutionAdapter =>
        new MysqlExecutionAdapter(codec),
    },
    {
      provide: DATABASE_SERVICE_CONNECTOR_REGISTRY,
      inject: [
        PostgresConfigCodec,
        PostgresConnectionProbe,
        PostgresExecutionAdapter,
        MysqlConfigCodec,
        MysqlConnectionProbe,
        MysqlExecutionAdapter,
      ],
      useFactory: (
        postgresCodec: PostgresConfigCodec,
        postgresProbe: PostgresConnectionProbe,
        postgresExecutionAdapter: PostgresExecutionAdapter,
        mysqlCodec: MysqlConfigCodec,
        mysqlProbe: MysqlConnectionProbe,
        mysqlExecutionAdapter: MysqlExecutionAdapter,
      ): IDatabaseServiceConnectorRegistry =>
        new DatabaseServiceConnectorRegistry(
          [
            createPostgresPlugin({
              configCodec: postgresCodec,
              probe: postgresProbe,
              executionAdapter: postgresExecutionAdapter,
            }),
            createMysqlPlugin({
              configCodec: mysqlCodec,
              probe: mysqlProbe,
              executionAdapter: mysqlExecutionAdapter,
            }),
          ],
          [FTPS_CONNECTOR_DESCRIPTOR],
        ),
    },
    { provide: CONNECTION_REFERENCE_PROVIDER, useExisting: ConnectionReferenceProvider },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: CONNECTION_EXECUTION_PROFILE_PROVIDER,
      useExisting: ConnectionExecutionProfileProvider,
    },
    {
      provide: DATABASE_SERVICE_RUNTIME_PROVIDER,
      useExisting: DatabaseServiceRuntimeProvider,
    },
    {
      // The use case takes its collaborators positionally and is not decorated,
      // so it is composed here rather than resolved by parameter metadata.
      provide: DatabaseServiceUseCases,
      inject: [
        DATABASE_SERVICE_REPOSITORY,
        DATABASE_SERVICE_READER,
        CREDENTIAL_VAULT,
        DATABASE_SERVICE_CONNECTOR_REGISTRY,
        DESTINATION_POLICY,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        DATABASE_SERVICE_MEMBERSHIP_REPOSITORY,
        DATABASE_CATALOG_READER,
      ],
      useFactory: (
        repository: IDatabaseServiceRepository,
        reader: IDatabaseServiceReader,
        credentialVault: ICredentialVault,
        plugins: IDatabaseServiceConnectorRegistry,
        destinationPolicy: IDestinationPolicy,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        memberships: IDatabaseServiceMembershipRepository,
        catalogs: IDatabaseCatalogReader,
      ): DatabaseServiceUseCases =>
        new DatabaseServiceUseCases(
          repository,
          reader,
          credentialVault,
          plugins,
          destinationPolicy,
          unitOfWork,
          clock,
          idGenerator,
          memberships,
          catalogs,
        ),
    },
    {
      provide: DatabaseServiceMembershipUseCases,
      inject: [
        DATABASE_SERVICE_MEMBERSHIP_REPOSITORY,
        DATABASE_CATALOG_READER,
        DATABASE_SERVICE_REPOSITORY,
        DATABASE_SERVICE_READER,
        DATABASE_SOURCE_USAGE_READER,
        UNIT_OF_WORK,
        CLOCK,
      ],
      useFactory: (
        memberships: IDatabaseServiceMembershipRepository,
        catalogs: IDatabaseCatalogReader,
        databaseServices: IDatabaseServiceRepository,
        reader: IDatabaseServiceReader,
        sourceUsage: IDatabaseSourceUsageReader,
        unitOfWork: IUnitOfWork,
        clock: IClock,
      ): DatabaseServiceMembershipUseCases =>
        new DatabaseServiceMembershipUseCases(
          memberships,
          catalogs,
          databaseServices,
          reader,
          sourceUsage,
          unitOfWork,
          clock,
        ),
    },
    {
      provide: CdcConnectionProfileUseCases,
      inject: [
        CDC_CONNECTION_PROFILE_REPOSITORY,
        DATABASE_SERVICE_REPOSITORY,
        CREDENTIAL_VAULT,
        DATABASE_SERVICE_CONNECTOR_REGISTRY,
        CDC_CONNECTION_PREFLIGHT,
        CDC_CONNECTION_USAGE_READER,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
      ],
      useFactory: (
        profiles: ICdcConnectionProfileRepository,
        databaseServices: IDatabaseServiceRepository,
        credentialVault: ICredentialVault,
        plugins: IDatabaseServiceConnectorRegistry,
        preflight: ICdcConnectionPreflight,
        usage: ICdcConnectionUsageReader,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        contexts: AuthenticatedContextStore,
      ): CdcConnectionProfileUseCases =>
        new CdcConnectionProfileUseCases(
          profiles,
          databaseServices,
          credentialVault,
          plugins,
          preflight,
          usage,
          unitOfWork,
          clock,
          idGenerator,
          contexts,
        ),
    },
  ],
  exports: [
    DATABASE_SERVICE_READER,
    CONNECTION_REFERENCE_PROVIDER,
    CONNECTION_EXECUTION_PROFILE_PROVIDER,
    DATABASE_SERVICE_RUNTIME_PROVIDER,
    DatabaseServiceMembershipUseCases,
    CDC_CONNECTION_RUNTIME_PROVIDER,
    PostgresConfigCodec,
    MysqlConfigCodec,
  ],
})
export class DatabaseServiceModule {}
