import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import type { DependencyState } from '@domain/data-workflow/models/workflow-run-state';

/** JSON owned by the data-workflow boundary, never a Prisma JsonValue. */
export type WorkflowJson = Readonly<Record<string, unknown>>;

export type WorkflowRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface DataWorkflow {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly draft: WorkflowGraph;
  readonly revision: number;
  readonly publishedVersion?: number;
  readonly paused: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** An append-only published graph and trigger snapshot. */
export interface DataWorkflowVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionNumber: number;
  readonly graph: WorkflowGraph;
  readonly trigger: WorkflowJson;
  /** Immutable, non-authoritative labels keyed by workflow pipeline node ID. */
  readonly pipelineDisplayNames?: Readonly<Record<string, string>>;
  readonly publishedAt: Date;
}

export interface DataWorkflowRun {
  readonly id: string;
  readonly organizationId: string;
  readonly workflowId: string;
  readonly versionId: string;
  readonly actor: string;
  readonly delegation?: WorkflowJson;
  readonly parameters: WorkflowJson;
  readonly triggerContext: WorkflowJson;
  readonly status: WorkflowRunStatus;
  readonly revision: number;
  readonly leaseOwner?: string;
  readonly leaseToken?: string;
  readonly leaseExpiresAt?: Date;
  /** Persisted wake-up time prevents workers from hot-looping on active runs. */
  readonly nextReconciliationAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DataWorkflowNodeAttempt {
  readonly id: string;
  readonly organizationId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly attemptNumber: number;
  readonly state: DependencyState | 'RUNNING';
  readonly executionId?: string;
  readonly error?: string;
  /** Distinguishes execution cancellation from a recoverable pipeline failure. */
  readonly failureKind?: 'CANCELLED';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * An append-only human acknowledgement that a retry may repeat a non-idempotent
 * write. It records the retry attempt without changing the run's initiating actor.
 */
export interface DataWorkflowRetryAcknowledgement {
  readonly id: string;
  readonly organizationId: string;
  readonly runId: string;
  readonly nodeAttemptId: string;
  readonly nodeId: string;
  readonly attemptNumber: number;
  readonly approvedBy: string;
  readonly acknowledgementSignal: true;
  readonly purpose: 'DUPLICATE_APPEND_WRITE_RISK';
  readonly acknowledgedAt: Date;
}

export interface DataWorkflowEdgeState {
  readonly id: string;
  readonly organizationId: string;
  readonly runId: string;
  readonly edgeId: string;
  readonly state: DependencyState;
  readonly updatedAt: Date;
}
