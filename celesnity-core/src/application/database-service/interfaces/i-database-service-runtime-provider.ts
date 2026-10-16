import type { DatabaseServiceRuntimeProfile } from '@application/database-service/read-models/database-service-runtime-profile';

export interface IDatabaseServiceRuntimeProvider {
  requireVerified(databaseServiceId: string): Promise<DatabaseServiceRuntimeProfile>;
}
