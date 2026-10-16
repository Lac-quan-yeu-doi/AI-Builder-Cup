import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { DatabaseServiceDetailsInput } from '@/src/entities/models/database-service';

import { normalizeDatabaseServiceDetails } from './normalize-database-service-input';

export type TestUnsavedDatabaseServiceUseCase = ReturnType<
  typeof createTestUnsavedDatabaseServiceUseCase
>;

export const createTestUnsavedDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) =>
  (connectorType: string, details: DatabaseServiceDetailsInput) =>
    repository.testUnsaved(connectorType, normalizeDatabaseServiceDetails(details));
