import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ApprovePendingActionUseCase } from '@/src/application/use-cases/pending-actions/approve-pending-action.use-case';
import {
  presentPendingAction,
  type PendingActionViewModel,
} from '@/src/interface-adapters/presenters/pending-action.presenter';

import { decidePendingActionInputSchema } from './pending-action.schemas';

export type ApprovePendingActionController = (id: string) => Promise<PendingActionViewModel>;

export const createApprovePendingActionController =
  (useCase: ApprovePendingActionUseCase): ApprovePendingActionController =>
  async (id: string): Promise<PendingActionViewModel> => {
    const parsed = decidePendingActionInputSchema.safeParse({ id });
    if (!parsed.success)
      throw new InputParseError('Invalid pending-action id', { cause: parsed.error });
    return presentPendingAction(await useCase(parsed.data.id));
  };
