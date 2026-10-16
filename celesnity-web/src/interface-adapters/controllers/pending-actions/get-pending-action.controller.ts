import { InputParseError } from '@/src/entities/errors/application-errors';
import type { GetPendingActionUseCase } from '@/src/application/use-cases/pending-actions/get-pending-action.use-case';
import {
  presentPendingAction,
  type PendingActionViewModel,
} from '@/src/interface-adapters/presenters/pending-action.presenter';

import { getPendingActionInputSchema } from './pending-action.schemas';

export type GetPendingActionController = (id: string) => Promise<PendingActionViewModel>;

export const createGetPendingActionController =
  (useCase: GetPendingActionUseCase): GetPendingActionController =>
  async (id: string): Promise<PendingActionViewModel> => {
    const parsed = getPendingActionInputSchema.safeParse({ id });
    if (!parsed.success)
      throw new InputParseError('Invalid pending-action id', { cause: parsed.error });
    return presentPendingAction(await useCase(parsed.data.id));
  };
