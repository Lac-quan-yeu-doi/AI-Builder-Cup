import { Inject, Injectable } from '@nestjs/common';

import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type { IDatabaseServiceConnectorRegistry } from '@application/database-service/interfaces/i-database-service-connector-registry';
import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import type { ICredentialVault } from '@application/database-service/interfaces/i-credential-vault';
import type { IDatabaseServiceRepository } from '@application/database-service/interfaces/i-database-service-repository';
import type { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import {
  CREDENTIAL_VAULT,
  DATABASE_SERVICE_CONNECTOR_REGISTRY,
  DATABASE_SERVICE_REPOSITORY,
} from '@application/database-service/tokens';
import { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

/**
 * Adapter for {@link IConnectionExecutionProfileProvider}: loads the connection,
 * decrypts its credential, and assembles the execution profile.
 *
 * Lives in infrastructure because it is an implementation, not a declaration.
 * That also lets it be a plain `@Injectable`, so the module binds it with
 * `useExisting` like every sibling adapter instead of a hand-written factory.
 */
@Injectable()
export class ConnectionExecutionProfileProvider implements IConnectionExecutionProfileProvider {
  public constructor(
    @Inject(DATABASE_SERVICE_REPOSITORY) private readonly repository: IDatabaseServiceRepository,
    @Inject(CREDENTIAL_VAULT) private readonly credentialVault: ICredentialVault,
    @Inject(DATABASE_SERVICE_CONNECTOR_REGISTRY)
    private readonly plugins: IDatabaseServiceConnectorRegistry,
  ) {}

  public async resolveExecutionProfile(
    connectionId: string,
  ): Promise<ExecutionConnectionDescriptor> {
    let id: ConnectionId;
    try {
      id = ConnectionId.from(connectionId);
    } catch {
      throw ConnectionAccessError.invalidId();
    }

    const connection = await this.repository.findById(id);
    if (connection === undefined || connection.isArchived) {
      throw ConnectionAccessError.notFound();
    }

    const plugin = this.plugins.require(connection.connectorType);
    const credential = PlaintextCredentialPayload.create(
      connection.credentialSchemaVersion,
      await this.credentialVault.decrypt(connection.credential),
    );
    return plugin.executionAdapter.build(connection.config, credential);
  }
}
