export type PendingActionStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface PendingActionActor {
  readonly source: 'agent' | 'browser' | 'dev-bypass' | 'anonymous';
  readonly runId: string | null;
  readonly identityId: string | null;
}

export interface PendingAction {
  readonly id: string;
  readonly actionName: string;
  readonly input: unknown;
  readonly actor: PendingActionActor;
  readonly status: PendingActionStatus;
  readonly rationale: string | null;
  readonly result: unknown;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly expiresAt: string;
}

export interface ListPendingActionsFilter {
  readonly status?: PendingActionStatus;
  readonly actorSource?: PendingActionActor['source'];
  readonly runId?: string;
}

export function isPendingActionExpired(action: PendingAction, now: Date = new Date()): boolean {
  return action.status === 'pending' && now >= new Date(action.expiresAt);
}
