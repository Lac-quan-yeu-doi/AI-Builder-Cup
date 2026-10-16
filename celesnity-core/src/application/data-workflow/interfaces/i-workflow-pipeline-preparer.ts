import type {
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';

/** Ensures an authorized, pinned pipeline has the immutable runtime artifact a run needs. */
export interface IWorkflowPipelinePreparer {
  prepare(actor: WorkflowActor, pipeline: PipelineReference): Promise<void>;
}
