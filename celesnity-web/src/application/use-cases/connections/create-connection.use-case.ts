import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type { DataConnectionInput } from '@/src/entities/models/connection';

import { normalizeConnectionInput } from './normalize-connection-input';

export type CreateConnectionUseCase = ReturnType<typeof createCreateConnectionUseCase>;

export const createCreateConnectionUseCase =
  (repository: ConnectionRepository) => (input: DataConnectionInput) =>
    repository.create(normalizeConnectionInput(input));
