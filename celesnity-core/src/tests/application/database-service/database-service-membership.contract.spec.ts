import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';

describe('DatabaseService membership boundary', () => {
  it('does not expose a catalog database membership from the physical connection aggregate', () => {
    const connection = DatabaseService.rehydrate({
      id: ConnectionId.from('77777777-7777-4777-8777-777777777777'),
      name: ConnectionName.create('customer postgres'),
      connectorType: ConnectorType.create('POSTGRESQL'),
      config: NormalizedConnectionConfig.create(1, {
        databaseName: 'customer_source',
        host: 'db.internal',
        port: 5432,
        sslMode: 'require',
        username: 'readonly',
      }),
      credential: CredentialReference.create({
        ciphertext: 'ciphertext',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      }),
      credentialSchemaVersion: 1,
      verification: VerificationState.untested(),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect('databaseName' in connection).toBe(false);
    expect(connection.config.toRecord().databaseName).toBe('customer_source');
  });
});
