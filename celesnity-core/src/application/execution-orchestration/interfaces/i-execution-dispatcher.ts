/**
 * A queued execution the worker may attempt to claim, together with the script
 * version it refers to.
 *
 * "May attempt" is the important part. This is a candidate, not a reservation:
 * the row is still QUEUED when it is returned here, and two workers polling at
 * the same moment can legitimately receive the same candidate. Exclusivity is
 * established afterwards, by the guarded `QUEUED -> PREPARING` update, which
 * exactly one of them can win.
 */
export interface QueuedExecutionCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly workload: ExecutionWorkload;
  readonly connectionId?: string;
  readonly authorizationIdentityId?: string;
}

export interface BackgroundExecutionCandidate {
  readonly id: string;
  readonly organizationId: string;
}

/**
 * Read-only port for finding executions the worker should act on.
 *
 * This port used to *claim*: it ran `UPDATE executions SET status = 'PREPARING'`
 * in hand-written SQL and inserted its own outbox row alongside. That worked, but
 * it meant the Execution state machine had two owners. `canTransition` was never
 * consulted for the transition, `Execution.startPreparing()` was dead code
 * despite looking authoritative, and the outbox had a second writer with its own
 * insert statement. The same was true of finalizing a cancellation.
 *
 * So the port was narrowed to what only SQL can do well — find rows — and the
 * transitions moved back to the aggregate, where the transition table and the
 * event live. The exclusivity that `FOR UPDATE SKIP LOCKED` used to provide is
 * now provided by the status guard on the update, which the repository already
 * had for every other transition.
 */
export interface IExecutionDispatcher {
  /**
   * Lists up to `limit` executions waiting in the queue, oldest first. Purely a
   * read; the caller claims one by transitioning it.
   */
  listQueuedCandidates(limit: number): Promise<readonly QueuedExecutionCandidate[]>;

  /**
   * Lists executions stuck in CANCELLING that this worker is not processing —
   * cancelled before they were ever claimed, or orphaned by a crashed worker.
   * `excludeIds` are the executions in flight here, which finalize themselves
   * once their child process exits.
   */
  listAbandonedCancellations(
    limit: number,
    excludeIds: readonly string[],
  ): Promise<readonly BackgroundExecutionCandidate[]>;
}
import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';
