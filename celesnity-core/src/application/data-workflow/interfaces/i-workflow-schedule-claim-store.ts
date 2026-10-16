import type { WorkflowScheduleTriggerKind } from '@domain/data-workflow/models/workflow-schedule';

/** Cross-tenant discovery data for one fenced automatic schedule. */
export interface WorkflowScheduleClaim {
  readonly scheduleId: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly actor: string;
  readonly triggerKind: WorkflowScheduleTriggerKind;
  readonly nextDueAt: Date;
  readonly intervalAnchorAt?: Date;
  readonly coalescedFromAt?: Date;
  readonly coalescedThroughAt?: Date;
  readonly coalescedCount: number;
  readonly revision: number;
  readonly leaseToken: string;
}

export interface ClaimDueWorkflowSchedulesInput {
  readonly limit: number;
  readonly owner: string;
  readonly now: Date;
  readonly leaseMs: number;
}

export interface CompleteWorkflowScheduleClaimInput {
  readonly claim: WorkflowScheduleClaim;
  readonly owner: string;
  readonly now: Date;
  readonly nextDueAt: Date;
  readonly coalescedFromAt?: Date;
  readonly coalescedThroughAt?: Date;
  readonly coalescedCount: number;
}

/** Only the scheduler uses this global claim port; work then resumes in tenant context. */
export interface IWorkflowScheduleClaimStore {
  claimDue(input: ClaimDueWorkflowSchedulesInput): Promise<readonly WorkflowScheduleClaim[]>;
  complete(input: CompleteWorkflowScheduleClaimInput): Promise<boolean>;
}
