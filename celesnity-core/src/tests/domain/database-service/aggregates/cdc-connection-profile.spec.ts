import { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import {
  CdcConnectionProfileId,
  CdcConnectionSetupMode,
  CdcConnectionVerification,
  CdcConnectionVerificationStatus,
} from '@domain/database-service/value-objects/cdc-connection-profile';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import {
  NormalizedConnectionConfig,
  type NormalizedConnectionConfig as NormalizedConnectionConfigValue,
} from '@domain/database-service/value-objects/normalized-connection-config';
import {
  ConnectionId,
  CredentialReference,
} from '@domain/database-service/value-objects/connection-value-objects';

const PROFILE_ID = '12121212-1212-4212-8212-121212121212';
const DATABASE_SERVICE_ID = '34343434-3434-4434-8434-343434343434';
const ORGANIZATION_ID = '56565656-5656-4656-8656-565656565656';
const CREATED_AT = new Date('2026-09-21T01:00:00.000Z');
const CHANGED_AT = new Date('2026-09-21T02:00:00.000Z');

function config(port = 5432) {
  return NormalizedConnectionConfig.create(1, {
    databaseName: 'postgres',
    host: 'db.project.supabase.co',
    port,
    sslMode: 'require',
    username: 'cdc_user',
  });
}

function credential(value = 'cipher-a') {
  return CredentialReference.create({
    ciphertext: value,
    initializationVector: 'iv',
    authenticationTag: 'tag',
    keyVersion: 'v1',
  });
}

function state(overrides: Partial<Parameters<typeof CdcConnectionProfile.rehydrate>[0]> = {}) {
  return {
    id: CdcConnectionProfileId.from(PROFILE_ID),
    organizationId: ORGANIZATION_ID,
    databaseServiceId: ConnectionId.from(DATABASE_SERVICE_ID),
    connectorType: ConnectorType.create('POSTGRESQL'),
    config: config(),
    credential: credential(),
    credentialSchemaVersion: 1,
    setupMode: CdcConnectionSetupMode.EXISTING,
    publicationName: 'celesnity_orders_publication',
    slotName: 'celesnity_orders_slot',
    verification: CdcConnectionVerification.ready(CREATED_AT),
    revision: 1,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

interface ChangeOverrides {
  readonly config?: NormalizedConnectionConfigValue;
  readonly credential?: CredentialReference;
  readonly credentialSchemaVersion?: number;
}

describe('CdcConnectionProfile', () => {
  it.each([CdcConnectionSetupMode.EXISTING, CdcConnectionSetupMode.MANAGED])(
    'registers a %s profile independently from the default datasource connection',
    (setupMode) => {
      const profile = CdcConnectionProfile.register(
        state({
          setupMode,
          ...(setupMode === CdcConnectionSetupMode.MANAGED
            ? { publicationName: undefined, slotName: undefined }
            : {}),
          verification: CdcConnectionVerification.untested(),
          revision: 0,
        }),
      );

      expect(profile.databaseServiceId.value).toBe(DATABASE_SERVICE_ID);
      expect(profile.organizationId).toBe(ORGANIZATION_ID);
      expect(profile.setupMode).toBe(setupMode);
      expect(profile.verification.status).toBe(CdcConnectionVerificationStatus.UNTESTED);
    },
  );

  it('requires explicit publication and slot names for PostgreSQL existing setup', () => {
    expect(() =>
      CdcConnectionProfile.register(
        state({
          publicationName: undefined,
          slotName: undefined,
          verification: CdcConnectionVerification.untested(),
          revision: 0,
        }),
      ),
    ).toThrow('publication');
  });

  it.each<readonly [string, ChangeOverrides]>([
    ['config', { config: config(5433) }],
    ['credential', { credential: credential('cipher-b') }],
    ['credential schema', { credentialSchemaVersion: 2 }],
  ])('resets verification when the %s changes', (_label, overrides) => {
    const profile = CdcConnectionProfile.rehydrate(state());

    const changed = profile.change({
      config: overrides.config ?? profile.config,
      credential: overrides.credential ?? profile.credential,
      credentialSchemaVersion: overrides.credentialSchemaVersion ?? profile.credentialSchemaVersion,
      setupMode: profile.setupMode,
      publicationName: profile.publicationName,
      slotName: profile.slotName,
      changedAt: CHANGED_AT,
    });

    expect(changed).toBe(true);
    expect(profile.verification.status).toBe(CdcConnectionVerificationStatus.UNTESTED);
    expect(profile.revision).toBe(2);
  });

  it('records only a safe issue code and message for failed verification', () => {
    const profile = CdcConnectionProfile.rehydrate(
      state({ verification: CdcConnectionVerification.untested() }),
    );

    profile.recordVerificationIssue(
      CHANGED_AT,
      CdcConnectionVerificationStatus.FAILED,
      'CDC_ENDPOINT_UNREACHABLE',
      'The CDC endpoint could not be reached.',
    );

    expect(profile.verification).toMatchObject({
      status: CdcConnectionVerificationStatus.FAILED,
      issueCode: 'CDC_ENDPOINT_UNREACHABLE',
      message: 'The CDC endpoint could not be reached.',
    });
    expect(JSON.stringify(profile.verification)).not.toContain('postgresql://');
  });
});
