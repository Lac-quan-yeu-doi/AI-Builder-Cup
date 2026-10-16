import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type { DataConnectionInput } from '@/src/entities/models/connection';

import { normalizeConnectionInput } from './normalize-connection-input';

export type UpdateConnectionUseCase = ReturnType<typeof createUpdateConnectionUseCase>;

export const createUpdateConnectionUseCase =
  (repository: ConnectionRepository) => (id: string, input: DataConnectionInput) =>
    repository.update(id, normalizeConnectionInput(input));
