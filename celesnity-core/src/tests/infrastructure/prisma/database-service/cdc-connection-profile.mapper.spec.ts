import { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import {
  CdcConnectionProfileId,
  CdcConnectionSetupMode,
  CdcConnectionVerification,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  CredentialReference,
} from '@domain/database-service/value-objects/connection-value-objects';
import {
  CdcConnectionProfileMapper,
  NON_SECRET_CDC_CONNECTION_PROFILE_SELECTION,
} from '@infrastructure/prisma/database-service/cdc-connection-profile.mapper';

const CREATED_AT = new Date('2026-09-21T01:00:00.000Z');

function profile(): CdcConnectionProfile {
  return CdcConnectionProfile.rehydrate({
    id: CdcConnectionProfileId.from('12121212-1212-4212-8212-121212121212'),
    organizationId: '56565656-5656-4656-8656-565656565656',
    databaseServiceId: ConnectionId.from('34343434-3434-4434-8434-343434343434'),
    connectorType: ConnectorType.create('POSTGRESQL'),
    config: NormalizedConnectionConfig.create(1, {
      databaseName: 'postgres',
      host: 'db.project.supabase.co',
      port: 5432,
      sslMode: 'require',
      username: 'cdc_user',
    }),
    credential: CredentialReference.create({
      ciphertext: 'ciphertext',
      initializationVector: 'iv',
      authenticationTag: 'tag',
      keyVersion: 'v1',
    }),
    credentialSchemaVersion: 1,
    setupMode: CdcConnectionSetupMode.EXISTING,
    publicationName: 'celesnity_publication',
    slotName: 'celesnity_slot',
    verification: CdcConnectionVerification.ready(CREATED_AT),
    revision: 3,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

describe('CdcConnectionProfileMapper', () => {
  const mapper = new CdcConnectionProfileMapper();

  it('persists the independently encrypted credential and optimistic revision', () => {
    const persistence = mapper.toInsertPersistence(profile());

    expect(persistence).toMatchObject({
      encryptedCredentialPayload: 'ciphertext',
      credentialSchemaVersion: 1,
      setupMode: 'EXISTING',
      publicationName: 'celesnity_publication',
      slotName: 'celesnity_slot',
      revision: 3,
    });
  });

  it('projects a safe view without encrypted or plaintext credential fields', () => {
    const view = mapper.toView({
      id: '12121212-1212-4212-8212-121212121212',
      databaseServiceId: '34343434-3434-4434-8434-343434343434',
      connectorType: 'POSTGRESQL',
      config: {
        databaseName: 'postgres',
        host: 'db.project.supabase.co',
        port: 5432,
        sslMode: 'require',
        username: 'cdc_user',
      },
      configSchemaVersion: 1,
      setupMode: 'EXISTING',
      publicationName: 'celesnity_publication',
      slotName: 'celesnity_slot',
      verificationStatus: 'READY',
      verificationIssueCode: null,
      verificationMessage: null,
      lastTestedAt: CREATED_AT,
      revision: 3,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    });

    expect(view).toMatchObject({
      endpointSummary: 'db.project.supabase.co:5432/postgres',
      setupMode: 'EXISTING',
      verificationStatus: 'READY',
    });
    expect(JSON.stringify(view)).not.toContain('credential');
    expect(NON_SECRET_CDC_CONNECTION_PROFILE_SELECTION).not.toHaveProperty(
      'encryptedCredentialPayload',
    );
    expect(NON_SECRET_CDC_CONNECTION_PROFILE_SELECTION).not.toHaveProperty('encryptionIv');
  });
});
