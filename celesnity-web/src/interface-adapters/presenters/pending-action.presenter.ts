import type {
  PendingAction,
  PendingActionActor,
  PendingActionStatus,
} from '@/src/entities/models/pending-action';

export interface PendingActionViewModel {
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

export function presentPendingAction(action: PendingAction): PendingActionViewModel {
  return Object.freeze({
    id: action.id,
    actionName: action.actionName,
    input: clone(action.input),
    actor: action.actor,
    status: action.status,
    rationale: action.rationale,
    result: clone(action.result),
    errorMessage: action.errorMessage,
    createdAt: action.createdAt,
    decidedAt: action.decidedAt,
    expiresAt: action.expiresAt,
  });
}

function clone<T>(value: T): T {
  return value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
