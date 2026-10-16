import type {
  DataWorkflow,
  DataWorkflowVersion,
  WorkflowJson,
} from '@domain/data-workflow/models/workflow-persistence';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

export interface CreateWorkflowDraft {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly draft: WorkflowGraph;
  readonly paused: boolean;
  readonly now: Date;
}

export interface SaveWorkflowDraft {
  readonly name: string;
  readonly draft: WorkflowGraph;
  readonly paused: boolean;
  readonly now: Date;
}

export interface PublishWorkflowSnapshot {
  readonly id: string;
  readonly graph: WorkflowGraph;
  readonly trigger: WorkflowJson;
  readonly pipelineDisplayNames?: Readonly<Record<string, string>>;
  readonly publishedAt: Date;
}

/** Persistence port for the mutable workflow head and append-only versions. */
export interface IWorkflowRepository {
  find(id: string): Promise<DataWorkflow | undefined>;
  listByOrganization(
    organizationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ readonly items: readonly DataWorkflow[]; readonly totalItems: number }>;
  findVersion(workflowId: string, versionNumber: number): Promise<DataWorkflowVersion | undefined>;
  findVersionById(id: string): Promise<DataWorkflowVersion | undefined>;
  listVersions(workflowId: string, limit: number): Promise<readonly DataWorkflowVersion[]>;
  create(draft: CreateWorkflowDraft): Promise<DataWorkflow>;
  saveDraft(id: string, expectedRevision: number, draft: SaveWorkflowDraft): Promise<boolean>;
  savePaused(id: string, expectedRevision: number, paused: boolean, now: Date): Promise<boolean>;
  publish(
    id: string,
    expectedRevision: number,
    versionSnapshot: PublishWorkflowSnapshot,
  ): Promise<DataWorkflowVersion | false>;
}
