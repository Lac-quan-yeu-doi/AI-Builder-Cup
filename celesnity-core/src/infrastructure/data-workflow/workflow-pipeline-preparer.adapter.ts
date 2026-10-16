import { Inject, Injectable } from '@nestjs/common';

import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelinePreparer } from '@application/data-workflow/interfaces/i-workflow-pipeline-preparer';
import { WORKFLOW_ACCESS } from '@application/data-workflow/tokens';
import { PipelineCompilationService } from '@application/pipeline-compilation/pipeline-compilation.service';

/** Compiles exactly the authorized pinned pipeline version used by a workflow snapshot. */
@Injectable()
export class WorkflowPipelinePreparerAdapter implements IWorkflowPipelinePreparer {
  public constructor(
    @Inject(WORKFLOW_ACCESS)
    private readonly access: IWorkflowAccess,
    private readonly compilation: PipelineCompilationService,
  ) {}

  public async prepare(actor: WorkflowActor, pipeline: PipelineReference): Promise<void> {
    await this.access.requirePipeline(actor, pipeline);
    await this.compilation.compile(pipeline.pipelineId, pipeline.versionNumber);
  }
}
