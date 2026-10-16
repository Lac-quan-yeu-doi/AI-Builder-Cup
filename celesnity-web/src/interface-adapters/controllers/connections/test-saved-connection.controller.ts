import type { TestSavedConnectionUseCase } from '@/src/application/use-cases/connections/test-saved-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import {
  presentConnectionVerification,
  type ConnectionVerificationViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

import { connectionIdSchema } from './connection.schemas';

export type TestSavedConnectionController = ReturnType<typeof createTestSavedConnectionController>;

export const createTestSavedConnectionController =
  (
    useCase: TestSavedConnectionUseCase,
  ): ((id: string) => Promise<ConnectionVerificationViewModel>) =>
  async (id) => {
    const parsed = connectionIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new InputParseError('Invalid connection id', { cause: parsed.error });
    }
    return presentConnectionVerification(await useCase(parsed.data));
  };
