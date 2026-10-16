import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type { ListPendingActionsFilter, PendingAction } from '@/src/entities/models/pending-action';

export type ListPendingActionsUseCase = (
  filter?: ListPendingActionsFilter,
) => Promise<readonly PendingAction[]>;

export const createListPendingActionsUseCase =
  (repository: PendingActionRepository): ListPendingActionsUseCase =>
  (filter?: ListPendingActionsFilter): Promise<readonly PendingAction[]> => {
    return repository.list(filter);
  };
