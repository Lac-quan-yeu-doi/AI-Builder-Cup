import type { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

export interface ICdcConnectionUsageReader {
  hasActiveCdcSubscriptions(
    organizationId: string,
    databaseServiceId: ConnectionId,
  ): Promise<boolean>;
}
