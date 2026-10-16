import { InputParseError } from '@/src/entities/errors/application-errors';
import type { RejectPendingActionUseCase } from '@/src/application/use-cases/pending-actions/reject-pending-action.use-case';
import {
  presentPendingAction,
  type PendingActionViewModel,
} from '@/src/interface-adapters/presenters/pending-action.presenter';

import { decidePendingActionInputSchema } from './pending-action.schemas';

export type RejectPendingActionController = (id: string) => Promise<PendingActionViewModel>;

export const createRejectPendingActionController =
  (useCase: RejectPendingActionUseCase): RejectPendingActionController =>
  async (id: string): Promise<PendingActionViewModel> => {
    const parsed = decidePendingActionInputSchema.safeParse({ id });
    if (!parsed.success)
      throw new InputParseError('Invalid pending-action id', { cause: parsed.error });
    return presentPendingAction(await useCase(parsed.data.id));
  };
