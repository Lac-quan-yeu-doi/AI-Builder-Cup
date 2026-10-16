import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import type { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';
import { CdcConnectionPreflightAdapter } from '@infrastructure/providers/database-service/cdc-connection-preflight.adapter';

describe('CdcConnectionPreflightAdapter', () => {
  it('rejects a known Supabase pooler before DNS resolution or a DB client is created', async () => {
    const destinationPolicy = {
      resolveAllowed: jest.fn(),
    } as unknown as IDestinationPolicy;
    const sourcePreflight = { check: jest.fn() } as unknown as CdcSourcePreflight;
    const adapter = new CdcConnectionPreflightAdapter(destinationPolicy, sourcePreflight);

    await expect(
      adapter.validate({
        databaseServiceId: '11111111-1111-4111-8111-111111111111',
        connectorType: 'POSTGRESQL',
        config: NormalizedConnectionConfig.create(1, {
          host: 'aws-0-ap-southeast-2.pooler.supabase.com',
          port: 5432,
          databaseName: 'postgres',
          username: 'cdc_user',
        }),
        destination: {
          host: 'aws-0-ap-southeast-2.pooler.supabase.com',
          port: 5432,
          engineLabel: 'PostgreSQL',
        },
        credential: PlaintextCredentialPayload.create(1, 'canary-secret'),
        setupMode: CdcConnectionSetupMode.EXISTING,
        publicationName: 'celesnity_publication',
        slotName: 'celesnity_slot',
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      issueCode: 'CDC_DIRECT_CONNECTION_REQUIRED',
    });
    expect(destinationPolicy.resolveAllowed).not.toHaveBeenCalled();
    expect(sourcePreflight.check).not.toHaveBeenCalled();
  });
});
