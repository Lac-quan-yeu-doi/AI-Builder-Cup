import type { ActionActor } from './action.types';

export type PendingActionStatus = 'pending' | 'approved' | 'rejected' | 'failed';

/**
 * A proposed-but-not-yet-applied action (AIP's "Checkpoint" pattern):
 * created when an `ActionDefinition` with `approvalRequired: true` is
 * called. Holds everything needed to actually run the action later, on
 * approval — `input`/`actor` are exactly what the original caller supplied.
 *
 * Domain-agnostic: nothing here is chart-specific, even though charts are
 * the only caller today. `actionName` is looked up against an
 * `IActionResolver` at approval time.
 */
export interface PendingAction {
  readonly id: string;
  readonly actionName: string;
  readonly input: unknown;
  readonly actor: ActionActor;
  readonly status: PendingActionStatus;
  /** Why the caller proposed this action, if it said — surfaced to the human reviewer. */
  readonly rationale: string | null;
  /** Populated once `status` is `'approved'` and the action ran successfully. */
  readonly result: unknown;
  /** Populated once `status` is `'failed'` — the action was approved but threw when it ran. */
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  /** Past this instant, `approve`/`reject` refuse the action (AIP's Checkpoint TTL). */
  readonly expiresAt: string;
}
