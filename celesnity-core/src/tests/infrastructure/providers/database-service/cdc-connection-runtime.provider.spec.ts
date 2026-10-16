import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { CdcConnectionRuntimeError } from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import { CdcConnectionRuntimeProvider } from '@infrastructure/providers/database-service/cdc-connection-runtime.provider';

describe('CdcConnectionRuntimeProvider', () => {
  it('fails closed when the datasource has no CDC profile and never reads a default credential', async () => {
    const contexts = new AuthenticatedContextStore();
    const profiles = {
      findByDatabaseService: jest.fn().mockResolvedValue(undefined),
    } as unknown as ICdcConnectionProfileRepository;
    const databaseServices = {
      findById: jest.fn().mockResolvedValue({ isArchived: false }),
    } as unknown as IDatabaseServiceRepository;
    const credentials = { decrypt: jest.fn() } as unknown as ICredentialVault;
    const provider = new CdcConnectionRuntimeProvider(
      profiles,
      databaseServices,
      credentials,
      {} as IDatabaseServiceConnectorRegistry,
      {} as IDestinationPolicy,
      contexts,
    );

    const operation = contexts.run(
      {
        identityId: '33333333-3333-4333-8333-333333333333',
        subject: 'tester',
        identityTenantId: 'tenant',
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationStatus: 'ACTIVE',
        mfaRequired: false,
        membershipId: '44444444-4444-4444-8444-444444444444',
        role: 'ORG_ADMIN',
        authenticationTime: 0,
        mfaVerified: true,
        visibleFeatures: null,
      },
      () => provider.requireVerified('11111111-1111-4111-8111-111111111111'),
    );

    await expect(operation).rejects.toEqual(
      new CdcConnectionRuntimeError('CDC_CONNECTION_REQUIRED'),
    );
    expect(credentials.decrypt).not.toHaveBeenCalled();
  });
});
