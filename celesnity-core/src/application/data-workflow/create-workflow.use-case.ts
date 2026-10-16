import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import { parseWorkflowGraph, workflowName } from '@application/data-workflow/workflow-graph-input';
import type { DataWorkflow } from '@domain/data-workflow/models/workflow-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface CreateWorkflowInput {
  readonly name: unknown;
  readonly graph: unknown;
  readonly paused?: unknown;
}

export class CreateWorkflowUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly access: IWorkflowAccess,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
  ) {}

  public async execute(actor: WorkflowActor, input: CreateWorkflowInput): Promise<DataWorkflow> {
    await this.access.require(actor, 'EDIT');
    const graph = parseWorkflowGraph(input.graph);
    return this.workflows.create({
      id: this.ids.next(),
      organizationId: actor.organizationId,
      name: workflowName(input.name),
      draft: graph,
      paused: input.paused === true,
      now: this.clock.now(),
    });
  }
}
