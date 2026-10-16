import type { DatabaseServiceModel } from '@generated/prisma/models/DatabaseService';
import {
  DatabaseServiceMapper,
  NON_SECRET_DATABASE_SERVICE_SELECTION,
  type NonSecretDatabaseServiceRecord,
} from '@infrastructure/prisma/database-service/database-service.mapper';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
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
import { VerificationStatus } from '@generated/prisma/enums';

const ID = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = new Date('2026-08-01T00:00:00.000Z');

function credential(): CredentialReference {
  return CredentialReference.create({
    ciphertext: 'ciphertext',
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function connection(connectorType: string, value: JsonObject): DatabaseService {
  return DatabaseService.rehydrate({
    id: ConnectionId.from(ID),
    name: ConnectionName.create(connectorType.toLowerCase()),
    connectorType: ConnectorType.create(connectorType),
    config: NormalizedConnectionConfig.create(1, value),
    credential: credential(),
    credentialSchemaVersion: 1,
    verification: VerificationState.untested(),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

function genericRow(type: string, config: Record<string, unknown>): DatabaseServiceModel {
  return {
    id: ID,
    name: type.toLowerCase(),
    connectorType: type,
    config,
    configSchemaVersion: 1,
    encryptedCredentialPayload: 'ciphertext',
    credentialSchemaVersion: 1,
    encryptionIv: 'iv',
    encryptionAuthTag: 'tag',
    encryptionKeyVersion: 'v1',
    verificationStatus: VerificationStatus.UNTESTED,
    lastTestedAt: null,
    lastTestError: null,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  } as unknown as DatabaseServiceModel;
}

describe('DatabaseServiceMapper generic persistence', () => {
  const mapper = new DatabaseServiceMapper();

  it('writes arbitrary DBMS config and generic credential fields', () => {
    const connectionValue = connection('TEST_DBMS', { endpoint: 'unit-test', catalog: 7 });

    expect(mapper.toInsertPersistence(connectionValue)).toMatchObject({
      connectorType: 'TEST_DBMS',
      config: { endpoint: 'unit-test', catalog: 7 },
      configSchemaVersion: 1,
      encryptedCredentialPayload: 'ciphertext',
      credentialSchemaVersion: 1,
    });
  });

  it('rehydrates PostgreSQL and a second DBMS without flattening their config', () => {
    const postgres = mapper.toDomain(
      genericRow('POSTGRESQL', {
        databaseName: 'analytics',
        host: 'db.internal',
        options: {},
        port: 6432,
        sslMode: 'require',
        username: 'alice',
      }),
    );
    const testDbms = mapper.toDomain(
      genericRow('TEST_DBMS', { endpoint: 'unit-test', catalog: 7 }),
    );

    expect(postgres.connectorType.value).toBe('POSTGRESQL');
    expect(postgres.config.toRecord()).toMatchObject({ host: 'db.internal', port: 6432 });
    expect(testDbms.connectorType.value).toBe('TEST_DBMS');
    expect(testDbms.config.toRecord()).toEqual({ endpoint: 'unit-test', catalog: 7 });
    expect(testDbms.credentialSchemaVersion).toBe(1);
  });

  it('projects generic fields into a non-secret view and selection', () => {
    const record = genericRow('TEST_DBMS', {
      endpoint: 'unit-test',
      catalog: 7,
    }) as unknown as NonSecretDatabaseServiceRecord;
    const view = mapper.toView(record);

    expect(view).toMatchObject({
      connectorType: 'TEST_DBMS',
      configSchemaVersion: 1,
      config: { endpoint: 'unit-test', catalog: 7 },
    });
    expect(NON_SECRET_DATABASE_SERVICE_SELECTION).toMatchObject({
      connectorType: true,
      config: true,
      configSchemaVersion: true,
    });
    expect(NON_SECRET_DATABASE_SERVICE_SELECTION).not.toHaveProperty('encryptedCredentialPayload');
    expect(NON_SECRET_DATABASE_SERVICE_SELECTION).not.toHaveProperty('encryptedPassword');
  });

  it('writes the generic config on updates rather than legacy PostgreSQL columns', () => {
    const connectionValue = connection('TEST_DBMS', { endpoint: 'unit-test', catalog: 7 });
    const persistence = mapper.toPersistence(connectionValue);

    expect(persistence).toMatchObject({
      connectorType: 'TEST_DBMS',
      config: { endpoint: 'unit-test', catalog: 7 },
      configSchemaVersion: 1,
      encryptedCredentialPayload: 'ciphertext',
      credentialSchemaVersion: 1,
    });
    expect(persistence).not.toHaveProperty('encryptedPassword');
  });

  it('rejects a non-object stored configuration root', () => {
    const record = genericRow('TEST_DBMS', [] as unknown as Record<string, unknown>);

    expect(() => mapper.toDomain(record)).toThrow(ConnectionMessage.storedConfigInvalid);
  });
});
