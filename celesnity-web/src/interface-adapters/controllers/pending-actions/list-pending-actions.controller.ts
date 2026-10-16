import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ListPendingActionsUseCase } from '@/src/application/use-cases/pending-actions/list-pending-actions.use-case';
import {
  presentPendingAction,
  type PendingActionViewModel,
} from '@/src/interface-adapters/presenters/pending-action.presenter';

import { listPendingActionsInputSchema } from './pending-action.schemas';

export type ListPendingActionsController = (
  filter?: unknown,
) => Promise<readonly PendingActionViewModel[]>;

export const createListPendingActionsController =
  (useCase: ListPendingActionsUseCase): ListPendingActionsController =>
  async (filter?: unknown): Promise<readonly PendingActionViewModel[]> => {
    const parsed = listPendingActionsInputSchema.safeParse(filter ?? {});
    if (!parsed.success)
      throw new InputParseError('Invalid pending-action filter', { cause: parsed.error });
    const actions = await useCase(parsed.data);
    return actions.map(presentPendingAction);
  };
