import type { ArchiveDatabaseServiceUseCase } from '@/src/application/use-cases/database-services/archive-database-service.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { databaseServiceIdSchema } from './database-service.schemas';

export type ArchiveDatabaseServiceController = ReturnType<
  typeof createArchiveDatabaseServiceController
>;

export const createArchiveDatabaseServiceController =
  (useCase: ArchiveDatabaseServiceUseCase): ((id: string) => Promise<void>) =>
  async (id) => {
    const parsed = databaseServiceIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid databaseService id', { cause: parsed.error });
    }
    await useCase(parsed.data);
  };
