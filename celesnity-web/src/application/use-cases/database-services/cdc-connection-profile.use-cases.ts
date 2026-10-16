import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { CdcConnectionProfileInput } from '@/src/entities/models/database-service';

export type CdcConnectionProfileUseCases = ReturnType<typeof createCdcConnectionProfileUseCases>;

export const createCdcConnectionProfileUseCases = (repository: DatabaseServiceRepository) => ({
  get: (databaseServiceId: string) => repository.getCdcConnection(databaseServiceId),
  save: (databaseServiceId: string, input: CdcConnectionProfileInput) =>
    repository.saveCdcConnection(databaseServiceId, input),
  validate: (databaseServiceId: string) => repository.validateCdcConnection(databaseServiceId),
  remove: (databaseServiceId: string) => repository.removeCdcConnection(databaseServiceId),
});
