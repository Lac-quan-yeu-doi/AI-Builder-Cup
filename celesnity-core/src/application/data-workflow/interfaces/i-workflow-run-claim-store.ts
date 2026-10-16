/**
 * The small, cross-tenant discovery boundary used only by the background worker.
 * It intentionally exposes no workflow payload: an organization context must be
 * installed before the worker can read or mutate the claimed run.
 */
export interface WorkflowRunClaim {
  readonly runId: string;
  readonly organizationId: string;
  readonly leaseToken: string;
}

export interface ClaimDueWorkflowRunsInput {
  readonly limit: number;
  readonly owner: string;
  readonly now: Date;
  readonly leaseMs: number;
  readonly reconciliationMs: number;
}

export interface IWorkflowRunClaimStore {
  claimDue(input: ClaimDueWorkflowRunsInput): Promise<readonly WorkflowRunClaim[]>;
}
