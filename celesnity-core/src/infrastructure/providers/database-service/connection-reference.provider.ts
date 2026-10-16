import { Inject, Injectable } from '@nestjs/common';

import { ConnectionAccessError } from '@application/database-service/errors/connection-access.error';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import type {
  ActiveConnectionReference,
  IConnectionReferenceProvider,
} from '@application/database-service/interfaces/i-connection-reference-provider';
import { DATABASE_SERVICE_READER } from '@application/database-service/tokens';
import { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

/**
 * Adapter for {@link IConnectionReferenceProvider}: validates the identifier and
 * confirms the connection is active via the read model.
 *
 * Lives in infrastructure because it is an implementation, not a declaration.
 * That also lets it be a plain `@Injectable`, so the module binds it with
 * `useExisting` like every sibling adapter instead of a hand-written factory.
 */
@Injectable()
export class ConnectionReferenceProvider implements IConnectionReferenceProvider {
  public constructor(
    @Inject(DATABASE_SERVICE_READER) private readonly reader: IDatabaseServiceReader,
  ) {}

  public async requireActive(connectionId: string): Promise<ActiveConnectionReference> {
    try {
      ConnectionId.from(connectionId);
    } catch {
      throw ConnectionAccessError.invalidId();
    }

    const connection = await this.reader.findActiveById(connectionId);
    if (connection === undefined) {
      throw ConnectionAccessError.notFound();
    }
    return { id: connection.id };
  }
}
