import { toDatabaseServiceView } from '@application/database-service/read-models/database-service.projection';
import { DatabaseService } from '@domain/database-service/aggregates/database-service';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  ConnectionName,
  CredentialReference,
  VerificationState,
} from '@domain/database-service/value-objects/connection-value-objects';

const NOW = new Date('2026-08-25T00:00:00.000Z');

function register(): DatabaseService {
  return DatabaseService.register(
    {
      id: ConnectionId.from('00000000-0000-4000-8000-000000000001'),
      name: ConnectionName.create('mes_saigonfood'),
      connectorType: ConnectorType.create('POSTGRESQL'),
      config: NormalizedConnectionConfig.create(1, {
        host: 'mes-db.local',
        port: 5432,
        databaseName: 'mes_prod',
        username: 'mes_readonly',
        sslMode: 'REQUIRE',
      }),
      credential: CredentialReference.create({
        ciphertext: 'cipher',
        initializationVector: 'iv',
        authenticationTag: 'tag',
        keyVersion: 'v1',
      }),
      credentialSchemaVersion: 1,
      verification: VerificationState.untested(),
      createdAt: NOW,
      updatedAt: NOW,
    },
    '00000000-0000-4000-8000-0000000000ff',
  );
}

describe('database membership boundary', () => {
  it('keeps the source DBMS database name inside connection config', () => {
    expect(register().config.toRecord().databaseName).toBe('mes_prod');
  });

  it('does not invent a catalog membership in the aggregate projection', () => {
    expect(toDatabaseServiceView(register()).databaseNames).toEqual([]);
  });
});
