import type { DatabaseServiceRepository } from '@/src/application/repositories/database-service.repository.interface';
import type { DatabaseServiceUpdateInput } from '@/src/entities/models/database-service';

import { normalizeDatabaseServiceDetails } from './normalize-database-service-input';

export type UpdateDatabaseServiceUseCase = ReturnType<typeof createUpdateDatabaseServiceUseCase>;

export const createUpdateDatabaseServiceUseCase =
  (repository: DatabaseServiceRepository) => (id: string, input: DatabaseServiceUpdateInput) =>
    repository.update(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.details !== undefined
        ? { details: normalizeDatabaseServiceDetails(input.details) }
        : {}),
    });
