import type { TestUnsavedDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/test-unsaved-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DatabaseServiceDetailsInput } from '@/src/entities/models/database-service';
import {
  presentDatabaseServiceVerification,
  type DatabaseServiceVerificationViewModel,
} from '@/src/interface-adapters/presenters/database-service.presenter';

import { databaseServiceDetailsInputSchema } from './database-service.schemas';

export type TestUnsavedDatabaseServiceController = ReturnType<
  typeof createTestUnsavedDatabaseServiceController
>;

export const createTestUnsavedDatabaseServiceController =
  (
    useCase: TestUnsavedDatabaseServiceUseCase,
  ): ((
    connectorType: string,
    details: DatabaseServiceDetailsInput,
  ) => Promise<DatabaseServiceVerificationViewModel>) =>
  async (connectorType, details) => {
    const parsed = databaseServiceDetailsInputSchema.safeParse(details);
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService details', { cause: parsed.error });
    }
    return presentDatabaseServiceVerification(await useCase(connectorType, parsed.data));
  };
