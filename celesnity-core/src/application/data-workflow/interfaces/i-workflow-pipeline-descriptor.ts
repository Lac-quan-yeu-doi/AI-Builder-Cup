import type {
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';

/** Tenant-scoped read of a pinned pipeline's human-facing identity. */
export interface IWorkflowPipelineDescriptor {
  describe(actor: WorkflowActor, reference: PipelineReference): Promise<{ readonly name: string }>;
}
