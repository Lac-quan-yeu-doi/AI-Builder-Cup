import type { PendingActionUseCases } from '@application/actions/pending-action.use-cases';
import type { ActionActor, ActionDefinition } from '@application/actions/action.types';
import type { IActionAuditLog } from '@application/actions/interfaces/i-action-audit-log';

/**
 * Outcome of `runAction`. `pending_approval` is a normal, successful
 * outcome (AIP's "Checkpoint" pattern) — not an error — so it's a result
 * variant rather than a thrown exception; this codebase's single error
 * pipeline (`ProblemDetailsFilter`) wraps everything it catches as
 * `{success: false, ...}`, which would misrepresent a proposed-and-pending
 * action as a failure.
 */
export type RunActionResult<TOutput> =
  | { readonly kind: 'completed'; readonly value: TOutput }
  | {
      readonly kind: 'pending_approval';
      readonly pendingActionId: string;
      readonly actionName: string;
    };

/**
 * Single execution path for every declared action: audits when required,
 * proposes-and-holds when approval is required, otherwise runs it.
 * Controllers call this instead of invoking a use-case directly, so
 * audit/approval behavior lives with the action's metadata rather than
 * being re-implemented per controller method.
 */
export async function runAction<TInput, TOutput>(
  action: ActionDefinition<TInput, TOutput>,
  input: TInput,
  actor: ActionActor,
  auditLog: IActionAuditLog,
  pendingActions: Pick<PendingActionUseCases, 'propose'>,
  rationale?: string,
  // Per-request override of `action.approvalRequired`, resolved by the
  // caller from `approvalOverrideFor(req, action.name)` — see
  // `action-approval-override.ts`. `undefined` means "no override for this
  // action," falling back to the action's own static default.
  approvalOverride?: boolean,
): Promise<RunActionResult<TOutput>> {
  if (action.auditRequired) {
    await auditLog.record(action.name, actor, input);
  }
  const approvalRequired = approvalOverride ?? action.approvalRequired;
  if (approvalRequired) {
    const pending = await pendingActions.propose(action.name, input, actor, rationale ?? null);
    return { kind: 'pending_approval', pendingActionId: pending.id, actionName: action.name };
  }
  const value = await action.run(input, actor);
  return { kind: 'completed', value };
}

/**
 * Unwraps a result from an action that never sets `approvalRequired`.
 * Throws if that invariant is ever violated — a bug at the call site
 * (an action flipped to `approvalRequired: true` without updating its
 * caller), not a normal user-facing outcome.
 */
export function unwrapCompleted<TOutput>(result: RunActionResult<TOutput>): TOutput {
  if (result.kind === 'pending_approval') {
    throw new Error(
      `Action "${result.actionName}" unexpectedly required approval — its caller doesn't handle that.`,
    );
  }
  return result.value;
}
