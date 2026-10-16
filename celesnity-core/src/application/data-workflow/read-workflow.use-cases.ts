import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import type {
  DataWorkflow,
  DataWorkflowVersion,
} from '@domain/data-workflow/models/workflow-persistence';

export interface WorkflowPage {
  readonly items: readonly DataWorkflow[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
}

export class ListWorkflowsUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(
    actor: WorkflowActor,
    page: number,
    pageSize: number,
  ): Promise<WorkflowPage> {
    await this.access.require(actor, 'READ');
    const result = await this.workflows.listByOrganization(actor.organizationId, page, pageSize);
    return { ...result, page, pageSize };
  }
}

export class GetWorkflowUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(actor: WorkflowActor, workflowId: string): Promise<DataWorkflow> {
    await this.access.require(actor, 'READ', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    return workflow;
  }
}

export class ListWorkflowVersionsUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    limit: number,
  ): Promise<readonly DataWorkflowVersion[]> {
    await this.access.require(actor, 'READ', workflowId);
    const workflow = await this.workflows.find(workflowId);
    if (workflow === undefined || workflow.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    return this.workflows.listVersions(workflowId, limit);
  }
}
