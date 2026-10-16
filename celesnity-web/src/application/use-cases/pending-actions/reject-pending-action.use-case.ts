import type { PendingActionRepository } from '@/src/application/repositories/pending-action.repository.interface';
import type { PendingAction } from '@/src/entities/models/pending-action';

export type RejectPendingActionUseCase = (id: string) => Promise<PendingAction>;

export const createRejectPendingActionUseCase =
  (repository: PendingActionRepository): RejectPendingActionUseCase =>
  (id: string): Promise<PendingAction> => {
    return repository.reject(id);
  };
