import { Inject, Injectable } from '@nestjs/common';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import {
  CdcConnectionRuntimeError,
  type ICdcConnectionRuntimeProvider,
} from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import type { ICdcConnectionProfileRepository } from '@application/database-service/interfaces/i-cdc-connection-profile-repository';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import { CdcConnectionRuntimeProfileValue } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import {
  CDC_CONNECTION_PROFILE_REPOSITORY,
  CREDENTIAL_VAULT,
  DATABASE_SERVICE_CONNECTOR_REGISTRY,
  DATABASE_SERVICE_REPOSITORY,
  DESTINATION_POLICY,
} from '@application/database-service/tokens';
import { CdcConnectionVerificationStatus } from '@domain/database-service/value-objects/cdc-connection-profile';
import { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

@Injectable()
export class CdcConnectionRuntimeProvider implements ICdcConnectionRuntimeProvider {
  public constructor(
    @Inject(CDC_CONNECTION_PROFILE_REPOSITORY)
    private readonly profiles: ICdcConnectionProfileRepository,
    @Inject(DATABASE_SERVICE_REPOSITORY)
    private readonly databaseServices: IDatabaseServiceRepository,
    @Inject(CREDENTIAL_VAULT) private readonly credentials: ICredentialVault,
    @Inject(DATABASE_SERVICE_CONNECTOR_REGISTRY)
    private readonly connectors: IDatabaseServiceConnectorRegistry,
    @Inject(DESTINATION_POLICY) private readonly destinationPolicy: IDestinationPolicy,
    private readonly contexts: AuthenticatedContextStore,
  ) {}

  public async requireVerified(databaseServiceIdValue: string): Promise<CdcConnectionRuntimeProfileValue> {
    const databaseServiceId = ConnectionId.from(databaseServiceIdValue);
    const parent = await this.databaseServices.findById(databaseServiceId);
    if (parent === undefined || parent.isArchived) {
      throw new CdcConnectionRuntimeError('CDC_CONNECTION_REQUIRED');
    }
    const profile = await this.profiles.findByDatabaseService(
      this.contexts.require().organizationId,
      databaseServiceId,
    );
    if (profile === undefined) {
      throw new CdcConnectionRuntimeError('CDC_CONNECTION_REQUIRED');
    }
    if (profile.verification.status !== CdcConnectionVerificationStatus.READY) {
      throw new CdcConnectionRuntimeError('CDC_CONNECTION_NOT_READY');
    }
    const connector = this.connectors.require(profile.connectorType);
    const restored = connector.configCodec.restore(profile.config);
    const resolved = await this.destinationPolicy.resolveAllowed(restored.destination);
    return new CdcConnectionRuntimeProfileValue(
      profile.databaseServiceId.value,
      profile.connectorType.value,
      restored.config,
      PlaintextCredentialPayload.create(
        profile.credentialSchemaVersion,
        await this.credentials.decrypt(profile.credential),
      ),
      resolved.host,
      resolved.port,
      resolved.addresses,
      profile.setupMode,
      profile.publicationName,
      profile.slotName,
    );
  }
}
