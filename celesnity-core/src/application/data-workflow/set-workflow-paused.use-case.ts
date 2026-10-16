import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import type { DataWorkflow } from '@domain/data-workflow/models/workflow-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';

export class SetWorkflowPausedUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
    private readonly clock: IClock,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    expectedRevision: number,
    paused: boolean,
  ): Promise<DataWorkflow> {
    await this.access.require(actor, 'EDIT', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    if (!Number.isSafeInteger(expectedRevision) || workflow.revision !== expectedRevision) {
      throw WorkflowAuthoringError.revisionConflict();
    }
    const now = this.clock.now();
    if (!(await this.workflows.savePaused(workflowId, expectedRevision, paused, now))) {
      throw WorkflowAuthoringError.revisionConflict();
    }
    return { ...workflow, paused, revision: expectedRevision + 1, updatedAt: now };
  }
}
