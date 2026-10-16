import { Injectable } from '@nestjs/common';

import type { Prisma } from '@generated/prisma/client';
import type {
  DatabaseServiceGetPayload,
  DatabaseServiceModel,
  DatabaseServiceSelect,
} from '@generated/prisma/models/DatabaseService';
import type { DatabaseServiceView } from '@application/database-service/read-models/database-service.view';
import { toDatabaseServiceSummary } from '@application/database-service/read-models/database-service.view';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import {
  NormalizedConnectionConfig,
  type JsonObject,
} from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';
import {
  toDomainVerificationStatus,
  toPrismaVerificationStatus,
} from '@infrastructure/prisma/database-service/verification-status.boundary';

/**
 * The columns the read side selects. Credential columns and all legacy
 * PostgreSQL columns are deliberately absent, so a view cannot carry secrets
 * or accidentally depend on a DBMS-specific storage shape.
 */
export const NON_SECRET_DATABASE_SERVICE_SELECTION = {
  id: true,
  name: true,
  connectorType: true,
  config: true,
  configSchemaVersion: true,
  verificationStatus: true,
  lastTestedAt: true,
  lastTestError: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    select: { databaseName: true },
    orderBy: { databaseName: 'asc' },
  },
} as const satisfies DatabaseServiceSelect;

/** The row shape {@link NON_SECRET_DATABASE_SERVICE_SELECTION} produces. */
export type NonSecretDatabaseServiceRecord = DatabaseServiceGetPayload<{
  select: typeof NON_SECRET_DATABASE_SERVICE_SELECTION;
}>;

/** The columns a verification outcome writes, named off the schema model. */
export type VerificationPersistenceValues = Pick<
  DatabaseServiceModel,
  'verificationStatus' | 'lastTestedAt' | 'lastTestError' | 'updatedAt'
>;

/**
 * Mutable generic columns of a data connection row.
 *
 * This is intentionally derived from the generated model. The old flat
 * PostgreSQL columns stay in the database during the compatibility window, but
 * they are not part of the authoritative application write shape.
 */
export type DatabaseServicePersistenceValues = Pick<
  DatabaseServiceModel,
  | 'name'
  | 'connectorType'
  | 'configSchemaVersion'
  | 'encryptedCredentialPayload'
  | 'credentialSchemaVersion'
  | 'encryptionIv'
  | 'encryptionAuthTag'
  | 'encryptionKeyVersion'
  | 'verificationStatus'
  | 'lastTestedAt'
  | 'lastTestError'
  | 'archivedAt'
  | 'updatedAt'
> & { readonly config: Prisma.InputJsonValue };

/**
 * Prisma permits any JSON value at the generated boundary. The domain
 * configuration is an object, so reject null and array roots before creating a
 * {@link NormalizedConnectionConfig}; malformed stored rows fail explicitly
 * instead of being silently interpreted as another DBMS configuration.
 */
export function checkedJsonObject(value: Prisma.JsonValue): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ConnectionError.validation(ConnectionMessage.storedConfigInvalid);
  }
  return value as JsonObject;
}

/** Translates between the generic {@link DatabaseService} aggregate and Prisma. */
@Injectable()
export class DatabaseServiceMapper {
  /** Rebuilds the aggregate from the generic persisted row. */
  public toDomain(record: DatabaseServiceModel): DatabaseService {
    const config = NormalizedConnectionConfig.create(
      record.configSchemaVersion,
      checkedJsonObject(record.config),
    );

    return DatabaseService.rehydrate({
      id: ConnectionId.from(record.id),
      name: ConnectionName.create(record.name),
      connectorType: ConnectorType.create(record.connectorType),
      config,
      credential: CredentialReference.create({
        ciphertext: record.encryptedCredentialPayload,
        initializationVector: record.encryptionIv,
        authenticationTag: record.encryptionAuthTag,
        keyVersion: record.encryptionKeyVersion,
      }),
      credentialSchemaVersion: record.credentialSchemaVersion,
      verification: VerificationState.rehydrate(
        toDomainVerificationStatus(record.verificationStatus),
        record.lastTestedAt ?? undefined,
        record.lastTestError ?? undefined,
      ),
      archivedAt: record.archivedAt ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  /** The generic columns an insert supplies, including immutable identity. */
  public toInsertPersistence(connection: DatabaseService): Prisma.DatabaseServiceCreateInput {
    return {
      id: connection.id.value,
      createdAt: connection.createdAt,
      ...this.toPersistence(connection),
    };
  }

  /** Projects the aggregate onto its authoritative generic mutable columns. */
  public toPersistence(connection: DatabaseService): DatabaseServicePersistenceValues {
    return {
      name: connection.name.value,
      connectorType: connection.connectorType.value,
      config: connection.config.toRecord(),
      configSchemaVersion: connection.config.schemaVersion,
      encryptedCredentialPayload: connection.credential.ciphertext,
      credentialSchemaVersion: connection.credentialSchemaVersion,
      encryptionIv: connection.credential.initializationVector,
      encryptionAuthTag: connection.credential.authenticationTag,
      encryptionKeyVersion: connection.credential.keyVersion,
      archivedAt: connection.archivedAt ?? null,
      ...this.toVerificationPersistence(connection),
    };
  }

  /** Projects only the verification outcome for the standalone verification save. */
  public toVerificationPersistence(connection: DatabaseService): VerificationPersistenceValues {
    return {
      verificationStatus: toPrismaVerificationStatus(connection.verification.status),
      lastTestedAt: connection.verification.lastTestedAt ?? null,
      lastTestError: connection.verification.failureReason ?? null,
      updatedAt: connection.updatedAt,
    };
  }

  /** Projects a non-secret generic row onto the read model. */
  public toView(record: NonSecretDatabaseServiceRecord): DatabaseServiceView {
    const config = NormalizedConnectionConfig.create(
      record.configSchemaVersion,
      checkedJsonObject(record.config),
    );

    return {
      id: record.id,
      name: record.name,
      databaseNames: record.memberships?.map((membership) => membership.databaseName) ?? [],
      connectorType: record.connectorType,
      configSchemaVersion: config.schemaVersion,
      config: config.toRecord(),
      summary: toDatabaseServiceSummary(config.toRecord()),
      verificationStatus: toDomainVerificationStatus(record.verificationStatus),
      lastTestedAt: record.lastTestedAt?.toISOString(),
      lastTestError: record.lastTestError ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
