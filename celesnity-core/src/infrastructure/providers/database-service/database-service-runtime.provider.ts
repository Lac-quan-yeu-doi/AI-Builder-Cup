import { Inject, Injectable } from '@nestjs/common';

import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import type { IDatabaseServiceRuntimeProvider } from '@application/database-service/interfaces/i-database-service-runtime-provider';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';
import { DatabaseServiceRuntimeProfileValue } from '@application/database-service/read-models/database-service-runtime-profile';
import {
  CREDENTIAL_VAULT,
  DATABASE_SERVICE_CONNECTOR_REGISTRY,
  DATABASE_SERVICE_REPOSITORY,
  DESTINATION_POLICY,
} from '@application/database-service/tokens';
import type { IDestinationPolicy } from '@application/database-service/interfaces/i-destination-policy';
import {
  ConnectionId,
  VerificationStatusValue,
} from '@domain/database-service/value-objects/connection-value-objects';

/** Resolves a verified service into short-lived material for a metadata source. */
@Injectable()
export class DatabaseServiceRuntimeProvider implements IDatabaseServiceRuntimeProvider {
  public constructor(
    @Inject(DATABASE_SERVICE_REPOSITORY) private readonly repository: IDatabaseServiceRepository,
    @Inject(CREDENTIAL_VAULT) private readonly credentialVault: ICredentialVault,
    @Inject(DATABASE_SERVICE_CONNECTOR_REGISTRY)
    private readonly plugins: IDatabaseServiceConnectorRegistry,
    @Inject(DESTINATION_POLICY) private readonly destinationPolicy: IDestinationPolicy,
  ) {}

  public async requireVerified(databaseServiceId: string): Promise<DatabaseServiceRuntimeProfile> {
    let id: ConnectionId;
    try {
      id = ConnectionId.from(databaseServiceId);
    } catch {
      throw ConnectionAccessError.invalidId();
    }

    const connection = await this.repository.findById(id);
    if (connection === undefined || connection.isArchived) {
      throw ConnectionAccessError.notFound();
    }
    if (connection.verification.status !== VerificationStatusValue.SUCCEEDED) {
      throw ConnectionAccessError.notVerified();
    }

    const plugin = this.plugins.require(connection.connectorType);
    const restored = plugin.configCodec.restore(connection.config);
    const resolved = await this.destinationPolicy.resolveAllowed(restored.destination);
    const credential = PlaintextCredentialPayload.create(
      connection.credentialSchemaVersion,
      await this.credentialVault.decrypt(connection.credential),
    );

    return new DatabaseServiceRuntimeProfileValue(
      connection.id.value,
      connection.connectorType.value,
      restored.config,
      credential,
      resolved.host,
      resolved.port,
      resolved.addresses,
    );
  }
}
