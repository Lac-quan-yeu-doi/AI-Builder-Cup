import type { ArchiveConnectionUseCase } from '@/src/application/use-cases/connections/archive-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

import { connectionIdSchema } from './connection.schemas';

export type ArchiveConnectionController = ReturnType<typeof createArchiveConnectionController>;

export const createArchiveConnectionController =
  (useCase: ArchiveConnectionUseCase): ((id: string) => Promise<void>) =>
  async (id) => {
    const parsed = connectionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid connection id', { cause: parsed.error });
    }
    await useCase(parsed.data);
  };
