import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import { parseWorkflowGraph, workflowName } from '@application/data-workflow/workflow-graph-input';
import type { DataWorkflow } from '@domain/data-workflow/models/workflow-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface UpdateWorkflowInput {
  readonly revision: number;
  readonly name: unknown;
  readonly graph: unknown;
  readonly paused?: unknown;
}

export class UpdateWorkflowUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
    private readonly clock: IClock,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    input: UpdateWorkflowInput,
  ): Promise<DataWorkflow> {
    await this.access.require(actor, 'EDIT', workflowId);
    const current = await this.workflows.find(workflowId);
    if (current === undefined || current.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    if (!Number.isSafeInteger(input.revision) || input.revision !== current.revision) {
      throw WorkflowAuthoringError.revisionConflict();
    }
    const now = this.clock.now();
    const name = workflowName(input.name);
    const graph = parseWorkflowGraph(input.graph);
    const paused = input.paused === undefined ? current.paused : input.paused === true;
    if (
      !(await this.workflows.saveDraft(workflowId, input.revision, {
        name,
        draft: graph,
        paused,
        now,
      }))
    ) {
      throw WorkflowAuthoringError.revisionConflict();
    }
    return {
      ...current,
      name,
      draft: graph,
      paused,
      revision: current.revision + 1,
      updatedAt: now,
    };
  }
}
