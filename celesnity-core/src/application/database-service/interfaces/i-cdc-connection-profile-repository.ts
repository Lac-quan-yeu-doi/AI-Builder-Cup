import type { CdcConnectionProfile } from '@domain/database-service/aggregates/cdc-connection-profile';
import type { ConnectionId } from '@domain/database-service/value-objects/connection-value-objects';

export interface ICdcConnectionProfileRepository {
  findByDatabaseService(
    organizationId: string,
    databaseServiceId: ConnectionId,
  ): Promise<CdcConnectionProfile | undefined>;
  create(profile: CdcConnectionProfile): Promise<void>;
  update(profile: CdcConnectionProfile, expectedRevision: number): Promise<boolean>;
  delete(organizationId: string, databaseServiceId: ConnectionId): Promise<boolean>;
}
