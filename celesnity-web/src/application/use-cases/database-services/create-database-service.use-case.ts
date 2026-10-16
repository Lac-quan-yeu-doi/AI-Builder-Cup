import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { DatabaseServiceInput } from '@/src/entities/models/database-service';

import { normalizeDatabaseServiceInput } from './normalize-database-service-input';

export type CreateDatabaseServiceUseCase = ReturnType<typeof createCreateDatabaseServiceUseCase>;

export const createCreateDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) => (input: DatabaseServiceInput) =>
    repository.create(normalizeDatabaseServiceInput(input));
