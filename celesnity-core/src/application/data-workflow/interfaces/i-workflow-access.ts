/** The authenticated principal allowed to work within one organization. */
export interface WorkflowActor {
  readonly organizationId: string;
  readonly identityId: string;
}

/** A workflow deliberately pins a pipeline snapshot rather than its mutable draft. */
export interface PipelineReference {
  readonly pipelineId: string;
  readonly versionNumber: number;
}

export type WorkflowOperation = 'READ' | 'EDIT' | 'RUN';

/** Authorization boundary for workflows and every referenced pipeline version. */
export interface IWorkflowAccess {
  require(actor: WorkflowActor, operation: WorkflowOperation, workflowId?: string): Promise<void>;
  requirePipeline(actor: WorkflowActor, pipeline: PipelineReference): Promise<void>;
}
