import type { ConnectionRepository } from '@/src/application/repositories/connection.repository.interface';
import type { ConnectionDetailsInput } from '@/src/entities/models/connection';

import { normalizeConnectionDetails } from './normalize-connection-input';

export type TestUnsavedConnectionUseCase = ReturnType<typeof createTestUnsavedConnectionUseCase>;

export const createTestUnsavedConnectionUseCase =
  (repository: ConnectionRepository) => (details: ConnectionDetailsInput) =>
    repository.testUnsaved(normalizeConnectionDetails(details));
