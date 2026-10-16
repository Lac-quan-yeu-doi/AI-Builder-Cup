import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowScheduleRepository } from '@application/data-workflow/interfaces/i-workflow-schedule-repository';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import type { DataWorkflow } from '@domain/data-workflow/models/workflow-persistence';
import type { DataWorkflowSchedule } from '@domain/data-workflow/models/workflow-schedule';

export interface WorkflowScheduleView {
  readonly workflow: DataWorkflow;
  readonly schedule?: DataWorkflowSchedule;
}

/** Reads the active schedule state without exposing its execution identity. */
export class GetWorkflowScheduleUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly schedules: IWorkflowScheduleRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(actor: WorkflowActor, workflowId: string): Promise<WorkflowScheduleView> {
    await this.access.require(actor, 'READ', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    const schedule = await this.schedules.findCurrent(workflowId);
    if (
      schedule === undefined ||
      schedule.organizationId !== actor.organizationId ||
      schedule.workflowId !== workflow.id
    ) {
      return { workflow };
    }
    return { workflow, schedule };
  }
}
