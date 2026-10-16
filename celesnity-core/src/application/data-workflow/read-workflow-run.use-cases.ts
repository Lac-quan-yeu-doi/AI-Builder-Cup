import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWorkflowRunRepository,
  WorkflowRunSnapshot,
} from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';

export interface WorkflowRunPage {
  readonly items: readonly WorkflowRunSnapshot[];
  readonly limit: number;
}

export class ListWorkflowRunsUseCase {
  public constructor(
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    limit: number,
  ): Promise<WorkflowRunPage> {
    await this.access.require(actor, 'READ', workflowId);
    const runs = (await this.runs.listByWorkflow(workflowId, limit)).filter(
      (run) => run.organizationId === actor.organizationId,
    );
    const snapshots = await Promise.all(runs.map((run) => this.runs.findSnapshot(run.id)));
    return {
      items: snapshots.filter(
        (snapshot): snapshot is WorkflowRunSnapshot =>
          snapshot !== undefined &&
          snapshot.run.organizationId === actor.organizationId &&
          snapshot.run.workflowId === workflowId,
      ),
      limit,
    };
  }
}

export class GetWorkflowRunUseCase {
  public constructor(
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    runId: string,
  ): Promise<WorkflowRunSnapshot> {
    await this.access.require(actor, 'READ', workflowId);
    const snapshot = await this.runs.findSnapshot(runId);
    const run = snapshot?.run;
    if (
      snapshot === undefined ||
      run === undefined ||
      run.organizationId !== actor.organizationId ||
      run.workflowId !== workflowId
    ) {
      throw WorkflowRunError.notFound();
    }
    return snapshot;
  }
}
