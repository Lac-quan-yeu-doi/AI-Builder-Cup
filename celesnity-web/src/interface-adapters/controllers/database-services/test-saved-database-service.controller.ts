import type { TestSavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-saved-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentDatabaseServiceVerification,
  type DatabaseServiceVerificationViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { databaseServiceIdSchema } from './database-service.schemas';

export type TestSavedDatabaseServiceController = ReturnType<
  typeof createTestSavedDatabaseServiceController
>;

export const createTestSavedDatabaseServiceController =
  (
    useCase: TestSavedDatabaseServiceUseCase,
  ): ((id: string) => Promise<DatabaseServiceVerificationViewModel>) =>
  async (id) => {
    const parsed = databaseServiceIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService id', { cause: parsed.error });
    }
    return presentDatabaseServiceVerification(await useCase(parsed.data));
  };
