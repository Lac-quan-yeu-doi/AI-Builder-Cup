/**
 * The durable identity of one planned pipeline dispatch.  The database has a
 * unique constraint over this tuple, so a retry must reload this same attempt
 * instead of allocating another execution.
 */
export interface WorkflowNodeAttemptIdentity {
  readonly organizationId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly attemptNumber: number;
  /** The worker identity that currently owns the run lease. */
  readonly leaseOwner: string;
  /** Fences a reclaimed or revoked run from dispatching a new execution. */
  readonly leaseToken: string;
}

export interface WorkflowNodeAttemptExecution {
  readonly executionId?: string;
}

/**
 * Locks and associates a workflow attempt inside the caller's unit of work.
 * The implementation must serialize deliveries for one durable attempt and
 * verify that its run remains owned by the provided active lease.
 */
export interface IWorkflowNodeAttemptExecutionRepository {
  lock(identity: WorkflowNodeAttemptIdentity): Promise<WorkflowNodeAttemptExecution | undefined>;
  associate(identity: WorkflowNodeAttemptIdentity, executionId: string): Promise<boolean>;
}
