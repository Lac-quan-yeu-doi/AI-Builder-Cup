export type DataWorkflowTriggerKind = 'MANUAL' | 'CALENDAR' | 'INTERVAL' | 'WATCH_SOURCE';
export type DataWorkflowScheduleLifecycle = 'MANUAL' | 'ENABLED' | 'PAUSED';

export interface DataWorkflowSchedule {
  readonly kind: DataWorkflowTriggerKind;
  readonly lifecycle: DataWorkflowScheduleLifecycle;
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly nextDueAt?: string;
  readonly occurrenceCoverage: {
    readonly coalescedCount: number;
    readonly coalescedFromAt?: string;
    readonly coalescedThroughAt?: string;
  };
}

/** A list-safe summary. Draft graph and run context stay inside their future screens. */
export interface DataWorkflow {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly publishedVersion?: number;
  readonly paused: boolean;
  readonly triggerKind: DataWorkflowTriggerKind;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schedule?: DataWorkflowSchedule;
  /** Core may add this summary without exposing run parameters or node context. */
  readonly lastRunStatus?: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
}

import type { DataWorkflowDraft } from './data-workflow-graph';

/** The editor-only representation deliberately includes the draft graph. */
export interface DataWorkflowDetail extends DataWorkflow {
  readonly draft: DataWorkflowDraft;
}

export interface DataWorkflowVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly graph: unknown;
  readonly pipelineDisplayNames?: Readonly<Record<string, string>>;
  readonly trigger: unknown;
  readonly publishedAt: string;
}

/** A scrubbed node attempt supplied by Core. It never includes source data or error detail. */
export interface DataWorkflowNodeAttempt {
  readonly nodeId: string;
  readonly attemptNumber: number;
  readonly state: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  readonly executionId?: string;
}

/** A workflow-scoped execution history entry with only safe operational fields. */
export interface DataWorkflowRun {
  readonly id: string;
  readonly versionId?: string;
  readonly selectedOutcomeRoutes?: readonly {
    readonly nodeId: string;
    readonly portId: 'success' | 'error';
  }[];
  readonly status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  readonly recoveredFailure?: boolean;
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attempts: readonly DataWorkflowNodeAttempt[];
}

export interface StartedDataWorkflowRun {
  readonly runId: string;
  readonly status: 'QUEUED';
}

export interface RetryDataWorkflowNodeInput {
  readonly workflowId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly expectedRevision: number;
  readonly acknowledgeWriteRisk: true;
}

export interface DataWorkflowSchedulePreview {
  readonly source: 'DRAFT' | 'PUBLISHED';
  readonly kind: 'CALENDAR';
  readonly timeOfDay: string;
  readonly weekdays: readonly string[];
  readonly timezone: string;
  readonly occurrences: readonly string[];
}

export interface CreateDataWorkflowInput {
  readonly draft: DataWorkflowDraft;
  readonly paused?: boolean;
}

export interface UpdateDataWorkflowInput {
  readonly id: string;
  readonly expectedRevision: number;
  readonly draft: DataWorkflowDraft;
}

export interface DataWorkflowPage {
  readonly items: readonly DataWorkflow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export interface ListDataWorkflowsInput {
  readonly page: number;
  readonly pageSize: number;
}
