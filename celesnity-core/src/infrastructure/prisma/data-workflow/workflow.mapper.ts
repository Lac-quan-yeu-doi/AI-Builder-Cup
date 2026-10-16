import type { Prisma } from '@generated/prisma/client';
import type {
  DataWorkflow,
  DataWorkflowEdgeState,
  DataWorkflowNodeAttempt,
  DataWorkflowRetryAcknowledgement,
  DataWorkflowRun,
  DataWorkflowVersion,
  WorkflowJson,
  WorkflowRunStatus,
} from '@domain/data-workflow/models/workflow-persistence';
import type { DataWorkflowSchedule } from '@domain/data-workflow/models/workflow-schedule';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

type WorkflowRow = Omit<DataWorkflow, 'draft' | 'publishedVersion'> & {
  readonly draft: unknown;
  readonly publishedVersion: number | null;
};
type VersionRow = Omit<DataWorkflowVersion, 'graph' | 'trigger' | 'pipelineDisplayNames'> & {
  readonly graphSnapshot: unknown;
  readonly triggerSnapshot: unknown;
  readonly pipelineDisplayNames: unknown;
};
type RunRow = Omit<
  DataWorkflowRun,
  | 'delegation'
  | 'parameters'
  | 'triggerContext'
  | 'leaseOwner'
  | 'leaseToken'
  | 'leaseExpiresAt'
  | 'status'
> & {
  readonly delegation: unknown;
  readonly parameters: unknown;
  readonly triggerContext: unknown;
  readonly status: string;
  readonly leaseOwner: string | null;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: Date | null;
};
type NodeAttemptRow = Omit<
  DataWorkflowNodeAttempt,
  'executionId' | 'error' | 'state' | 'failureKind'
> & {
  readonly state: string;
  readonly executionId: string | null;
  readonly error: string | null;
  readonly failureKind: string | null;
};
type EdgeStateRow = Omit<DataWorkflowEdgeState, 'state'> & {
  readonly state: string;
};
type ScheduleRow = Omit<
  DataWorkflowSchedule,
  | 'intervalAnchorAt'
  | 'triggerKind'
  | 'coalescedFromAt'
  | 'coalescedThroughAt'
  | 'supersededAt'
  | 'leaseOwner'
  | 'leaseToken'
  | 'leaseExpiresAt'
> & {
  readonly triggerKind: string;
  readonly intervalAnchorAt: Date | null;
  readonly coalescedFromAt: Date | null;
  readonly coalescedThroughAt: Date | null;
  readonly supersededAt: Date | null;
  readonly leaseOwner: string | null;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: Date | null;
};

export const DATA_WORKFLOW_SELECTION = {
  id: true,
  organizationId: true,
  name: true,
  draft: true,
  revision: true,
  publishedVersion: true,
  paused: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const DATA_WORKFLOW_RUN_SELECTION = {
  id: true,
  organizationId: true,
  workflowId: true,
  versionId: true,
  actor: true,
  delegation: true,
  parameters: true,
  triggerContext: true,
  status: true,
  revision: true,
  leaseOwner: true,
  leaseToken: true,
  leaseExpiresAt: true,
  nextReconciliationAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const DATA_WORKFLOW_VERSION_SELECTION = {
  id: true,
  organizationId: true,
  workflowId: true,
  versionNumber: true,
  graphSnapshot: true,
  triggerSnapshot: true,
  pipelineDisplayNames: true,
  publishedAt: true,
} as const;

export const DATA_WORKFLOW_NODE_ATTEMPT_SELECTION = {
  id: true,
  organizationId: true,
  runId: true,
  nodeId: true,
  attemptNumber: true,
  state: true,
  executionId: true,
  error: true,
  failureKind: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const DATA_WORKFLOW_EDGE_STATE_SELECTION = {
  id: true,
  organizationId: true,
  runId: true,
  edgeId: true,
  state: true,
  updatedAt: true,
} as const;

export const DATA_WORKFLOW_RETRY_ACKNOWLEDGEMENT_SELECTION = {
  id: true,
  organizationId: true,
  runId: true,
  nodeAttemptId: true,
  nodeId: true,
  attemptNumber: true,
  approvedBy: true,
  acknowledgementSignal: true,
  purpose: true,
  acknowledgedAt: true,
} as const;

export const DATA_WORKFLOW_SCHEDULE_SELECTION = {
  id: true,
  organizationId: true,
  workflowId: true,
  versionId: true,
  actor: true,
  triggerKind: true,
  nextDueAt: true,
  intervalAnchorAt: true,
  coalescedFromAt: true,
  coalescedThroughAt: true,
  coalescedCount: true,
  revision: true,
  enabled: true,
  supersededAt: true,
  leaseOwner: true,
  leaseToken: true,
  leaseExpiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class WorkflowMapper {
  public toWorkflow(row: WorkflowRow): DataWorkflow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      draft: asGraph(row.draft),
      revision: row.revision,
      publishedVersion: row.publishedVersion ?? undefined,
      paused: row.paused,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public toVersion(row: VersionRow): DataWorkflowVersion {
    return {
      id: row.id,
      organizationId: row.organizationId,
      workflowId: row.workflowId,
      versionNumber: row.versionNumber,
      graph: asGraph(row.graphSnapshot),
      trigger: asJsonObject(row.triggerSnapshot),
      pipelineDisplayNames: asDisplayNames(row.pipelineDisplayNames),
      publishedAt: row.publishedAt,
    };
  }

  public toRun(row: RunRow): DataWorkflowRun {
    return {
      id: row.id,
      organizationId: row.organizationId,
      workflowId: row.workflowId,
      versionId: row.versionId,
      actor: row.actor,
      delegation: row.delegation === null ? undefined : asJsonObject(row.delegation),
      parameters: asJsonObject(row.parameters),
      triggerContext: asJsonObject(row.triggerContext),
      status: asRunStatus(row.status),
      revision: row.revision,
      leaseOwner: row.leaseOwner ?? undefined,
      leaseToken: row.leaseToken ?? undefined,
      leaseExpiresAt: row.leaseExpiresAt ?? undefined,
      nextReconciliationAt: row.nextReconciliationAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public toNodeAttempt(row: NodeAttemptRow): DataWorkflowNodeAttempt {
    return {
      id: row.id,
      organizationId: row.organizationId,
      runId: row.runId,
      nodeId: row.nodeId,
      attemptNumber: row.attemptNumber,
      state: asAttemptState(row.state),
      executionId: row.executionId ?? undefined,
      error: row.error ?? undefined,
      failureKind: asFailureKind(row.failureKind),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public toEdgeState(row: EdgeStateRow): DataWorkflowEdgeState {
    return {
      id: row.id,
      organizationId: row.organizationId,
      runId: row.runId,
      edgeId: row.edgeId,
      state: asDependencyState(row.state),
      updatedAt: row.updatedAt,
    };
  }

  public toSchedule(row: ScheduleRow): DataWorkflowSchedule {
    if (row.triggerKind !== 'CALENDAR' && row.triggerKind !== 'INTERVAL') {
      throw new Error('Persisted data workflow schedule has an invalid trigger kind.');
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      workflowId: row.workflowId,
      versionId: row.versionId,
      actor: row.actor,
      triggerKind: row.triggerKind,
      nextDueAt: row.nextDueAt,
      intervalAnchorAt: row.intervalAnchorAt ?? undefined,
      coalescedFromAt: row.coalescedFromAt ?? undefined,
      coalescedThroughAt: row.coalescedThroughAt ?? undefined,
      coalescedCount: row.coalescedCount,
      revision: row.revision,
      enabled: row.enabled,
      supersededAt: row.supersededAt ?? undefined,
      leaseOwner: row.leaseOwner ?? undefined,
      leaseToken: row.leaseToken ?? undefined,
      leaseExpiresAt: row.leaseExpiresAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public nodeAttemptInsert(attempt: DataWorkflowNodeAttempt): Record<string, unknown> {
    return {
      id: attempt.id,
      organizationId: attempt.organizationId,
      runId: attempt.runId,
      nodeId: attempt.nodeId,
      attemptNumber: attempt.attemptNumber,
      state: attempt.state,
      executionId: attempt.executionId ?? null,
      error: attempt.error ?? null,
      failureKind: attempt.failureKind ?? null,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  public edgeStateInsert(edge: DataWorkflowEdgeState): Record<string, unknown> {
    return {
      id: edge.id,
      organizationId: edge.organizationId,
      runId: edge.runId,
      edgeId: edge.edgeId,
      state: edge.state,
      updatedAt: edge.updatedAt,
    };
  }

  public retryAcknowledgementInsert(
    acknowledgement: DataWorkflowRetryAcknowledgement,
  ): Record<string, unknown> {
    return {
      id: acknowledgement.id,
      organizationId: acknowledgement.organizationId,
      runId: acknowledgement.runId,
      nodeAttemptId: acknowledgement.nodeAttemptId,
      nodeId: acknowledgement.nodeId,
      attemptNumber: acknowledgement.attemptNumber,
      approvedBy: acknowledgement.approvedBy,
      acknowledgementSignal: acknowledgement.acknowledgementSignal,
      purpose: acknowledgement.purpose,
      acknowledgedAt: acknowledgement.acknowledgedAt,
    };
  }

  public json(value: WorkflowJson | WorkflowGraph): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue;
  }
}

function asJsonObject(value: unknown): WorkflowJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Persisted data workflow JSON must be an object.');
  }
  return value as WorkflowJson;
}

function asDisplayNames(value: unknown): Readonly<Record<string, string>> {
  const record = asJsonObject(value);
  if (Object.values(record).some((name) => typeof name !== 'string')) {
    throw new Error('Persisted workflow pipeline display names must be strings.');
  }
  return record as Readonly<Record<string, string>>;
}

function asFailureKind(value: string | null): DataWorkflowNodeAttempt['failureKind'] {
  if (value === null) return undefined;
  if (value === 'CANCELLED') return value;
  throw new Error('Persisted workflow node failure kind is invalid.');
}

function asGraph(value: unknown): WorkflowGraph {
  const record = asJsonObject(value);
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    throw new Error('Persisted data workflow graph must contain nodes and edges.');
  }
  return record as unknown as WorkflowGraph;
}

function asRunStatus(value: string): WorkflowRunStatus {
  if (
    value === 'QUEUED' ||
    value === 'RUNNING' ||
    value === 'SUCCEEDED' ||
    value === 'FAILED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  throw new Error('Persisted data workflow run has an invalid status.');
}

function asDependencyState(value: string): DataWorkflowEdgeState['state'] {
  if (value === 'PENDING' || value === 'SUCCEEDED' || value === 'SKIPPED' || value === 'FAILED') {
    return value;
  }
  throw new Error('Persisted data workflow edge has an invalid state.');
}

function asAttemptState(value: string): DataWorkflowNodeAttempt['state'] {
  if (value === 'RUNNING') return value;
  return asDependencyState(value);
}
