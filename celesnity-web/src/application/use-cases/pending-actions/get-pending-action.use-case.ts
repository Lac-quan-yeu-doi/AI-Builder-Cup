import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type { PendingAction } from '@/src/entities/models/pending-action';

export type GetPendingActionUseCase = (id: string) => Promise<PendingAction>;

export const createGetPendingActionUseCase =
  (repository: PendingActionRepository): GetPendingActionUseCase =>
  (id: string): Promise<PendingAction> => {
    return repository.findById(id);
  };
