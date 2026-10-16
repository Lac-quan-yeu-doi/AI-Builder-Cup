import type { ListPendingActionsFilter, PendingAction } from '@/src/entities/models/pending-action';

export interface PendingActionRepository {
  list(filter?: ListPendingActionsFilter): Promise<readonly PendingAction[]>;
  findById(id: string): Promise<PendingAction>;
  approve(id: string): Promise<PendingAction>;
  reject(id: string): Promise<PendingAction>;
}
