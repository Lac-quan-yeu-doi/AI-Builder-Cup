import type { TestUnsavedConnectionUseCase } from '@/src/application/use-cases/connections/test-unsaved-connection.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ConnectionDetailsInput } from '@/src/entities/models/connection';
import {
  presentConnectionVerification,
  type ConnectionVerificationViewModel,
} from '@/src/interface-adapters/presenters/connection.presenter';

import { connectionDetailsInputSchema } from './connection.schemas';

export type TestUnsavedConnectionController = ReturnType<
  typeof createTestUnsavedConnectionController
>;

export const createTestUnsavedConnectionController =
  (
    useCase: TestUnsavedConnectionUseCase,
  ): ((details: ConnectionDetailsInput) => Promise<ConnectionVerificationViewModel>) =>
  async (details) => {
    const parsed = connectionDetailsInputSchema.safeParse(details);
    if (!parsed.success) {
      throw new InputParseError('Invalid connection details', { cause: parsed.error });
    }
    return presentConnectionVerification(await useCase(parsed.data));
  };
