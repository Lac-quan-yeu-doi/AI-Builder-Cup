import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowTargetSchemaReader } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';

export class ListWorkflowPipelineTargetsUseCase {
  public constructor(
    private readonly access: IWorkflowAccess,
    private readonly schemas: IWorkflowTargetSchemaReader,
  ) {}

  public async execute(
    actor: WorkflowActor,
    pipeline: PipelineReference,
  ): Promise<Awaited<ReturnType<IWorkflowTargetSchemaReader['describe']>>> {
    await this.access.requirePipeline(actor, pipeline);
    return this.schemas.describe(pipeline);
  }
}
