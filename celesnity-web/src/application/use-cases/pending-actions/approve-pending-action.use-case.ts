import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type { PendingAction } from '@/src/entities/models/pending-action';

export type ApprovePendingActionUseCase = (id: string) => Promise<PendingAction>;

export const createApprovePendingActionUseCase =
  (repository: PendingActionRepository): ApprovePendingActionUseCase =>
  (id: string): Promise<PendingAction> => {
    return repository.approve(id);
  };
