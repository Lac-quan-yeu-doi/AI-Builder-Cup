import type {
  DataWorkflowEdgeState,
  DataWorkflowNodeAttempt,
  DataWorkflowRetryAcknowledgement,
  DataWorkflowRun,
  DataWorkflowVersion,
  WorkflowJson,
  WorkflowRunStatus,
} from '@domain/data-workflow/models/workflow-persistence';

export interface CreateWorkflowRun {
  readonly id: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly actor: string;
  readonly delegation?: WorkflowJson;
  readonly parameters: WorkflowJson;
  readonly triggerContext: WorkflowJson;
  readonly now: Date;
}

export interface SaveWorkflowRunTransition {
  readonly status: WorkflowRunStatus;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: Date;
  readonly nextReconciliationAt?: Date;
  readonly updatedAt: Date;
  readonly nodeAttempts: readonly DataWorkflowNodeAttempt[];
  readonly edgeStates: readonly DataWorkflowEdgeState[];
  readonly retryAcknowledgements?: readonly DataWorkflowRetryAcknowledgement[];
}

/**
 * Proves that a background worker still owns an unexpired lease at the instant
 * it persists a graph transition. Interactive transitions omit this fence.
 */
export interface WorkflowRunLeaseFence {
  readonly owner: string;
  readonly token: string;
}

export interface WorkflowRunSnapshot {
  readonly run: DataWorkflowRun;
  readonly version?: DataWorkflowVersion;
  readonly nodeAttempts: readonly DataWorkflowNodeAttempt[];
  readonly edgeStates: readonly DataWorkflowEdgeState[];
}

/**
 * The run port only carries domain records.  A caller uses an IUnitOfWork around
 * a dispatch transition so an Execution insert and its node association share a
 * commit boundary.
 */
export interface IWorkflowRunRepository {
  /** Returns false when the database's active-run uniqueness guard rejects a race. */
  createRun(input: CreateWorkflowRun): Promise<DataWorkflowRun | false>;
  find(id: string): Promise<DataWorkflowRun | undefined>;
  listByWorkflow(workflowId: string, limit: number): Promise<readonly DataWorkflowRun[]>;
  findActive(workflowId: string): Promise<DataWorkflowRun | undefined>;
  findSnapshot(id: string): Promise<WorkflowRunSnapshot | undefined>;
  lockRun(id: string): Promise<DataWorkflowRun | undefined>;
  lockSnapshot(id: string): Promise<WorkflowRunSnapshot | undefined>;
  saveTransition(
    run: DataWorkflowRun,
    expectedRevision: number,
    transition: SaveWorkflowRunTransition,
    leaseFence?: WorkflowRunLeaseFence,
  ): Promise<boolean>;
  claimDue(
    limit: number,
    owner: string,
    now: Date,
    leaseMs: number,
  ): Promise<readonly DataWorkflowRun[]>;
  releaseClaim(id: string, owner: string, token: string): Promise<boolean>;
}
