import type { PendingAction, PendingActionStatus } from '../pending-action.model';

/**
 * `actorSource`/`runId` aren't real access control — they're a way for a
 * caller to narrow the list down to what it itself proposed (e.g. an agent
 * run filtering to its own `run_id`). `identityId` is real access control:
 * it's how `PendingActionController.list()` scopes a non-privileged human
 * caller to only their own proposals, now that `AuthenticatedContext`
 * exists (see the brainstorm doc's Round 6).
 */
export interface PendingActionListFilter {
  readonly status?: PendingActionStatus;
  readonly actorSource?: string;
  readonly runId?: string;
  readonly identityId?: string;
}

export interface IPendingActionRepository {
  create(pendingAction: PendingAction): Promise<PendingAction>;
  findById(id: string): Promise<PendingAction | null>;
  update(pendingAction: PendingAction): Promise<PendingAction>;
  list(filter?: PendingActionListFilter): Promise<readonly PendingAction[]>;
}
