import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { WorkflowRunError } from '@application/data-workflow/workflow-run.error';
import type { DataWorkflowRun } from '@domain/data-workflow/models/workflow-persistence';
import type { IClock } from '@application/shared/interfaces/i-clock';

/**
 * Rechecks the principal that started a durable run immediately before a worker
 * can advance it. The worker itself is only a tenant-scoped service account; it
 * must never replace the initiating principal for resource authorization.
 */
export class WorkflowRunAuthorizationService {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
    private readonly clock: IClock,
  ) {}

  public async authorize(runId: string, leaseToken: string): Promise<DataWorkflowRun> {
    const run = await this.runs.find(runId);
    if (
      run === undefined ||
      run.status !== 'RUNNING' ||
      run.leaseToken !== leaseToken ||
      run.leaseOwner === undefined ||
      run.leaseExpiresAt === undefined ||
      run.leaseExpiresAt.getTime() <= this.clock.now().getTime()
    ) {
      throw WorkflowRunError.leaseMismatch();
    }

    const actor: WorkflowActor = {
      organizationId: run.organizationId,
      identityId: run.actor,
    };
    await this.access.require(actor, 'RUN', run.workflowId);
    const version = await this.workflows.findVersionById(run.versionId);
    if (
      version === undefined ||
      version.organizationId !== run.organizationId ||
      version.workflowId !== run.workflowId
    ) {
      throw WorkflowRunError.notFound();
    }
    for (const node of version.graph.nodes) {
      if (node.type === 'PIPELINE') {
        await this.access.requirePipeline(actor, {
          pipelineId: node.pipelineId,
          versionNumber: node.versionNumber,
        });
      }
    }
    return run;
  }
}
