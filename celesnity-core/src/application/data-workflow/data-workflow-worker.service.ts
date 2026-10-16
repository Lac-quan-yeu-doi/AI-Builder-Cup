import { randomUUID } from 'node:crypto';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import type { IWorkflowRunClaimStore } from '@application/data-workflow/interfaces/i-workflow-run-claim-store';
import type { WorkflowRunAuthorizationService } from '@application/data-workflow/workflow-run-authorization.service';
import type { IClock } from '@application/shared/interfaces/i-clock';

export interface DataWorkflowWorkerConfig {
  readonly batchSize: number;
  readonly leaseMs: number;
  readonly reconciliationMs: number;
}

/** Claims durable workflow runs, then advances each claim in its own tenant context. */
export class DataWorkflowWorkerService {
  private readonly owner: string;

  public constructor(
    private readonly claims: IWorkflowRunClaimStore,
    private readonly authorizer: WorkflowRunAuthorizationService,
    private readonly advance: AdvanceWorkflowRunService,
    private readonly contexts: AuthenticatedContextStore,
    private readonly clock: IClock,
    private readonly config: DataWorkflowWorkerConfig,
    owner: string = randomUUID(),
  ) {
    this.owner = owner;
  }

  public async tick(): Promise<number> {
    const claims = await this.claims.claimDue({
      limit: this.config.batchSize,
      owner: this.owner,
      now: this.clock.now(),
      leaseMs: this.config.leaseMs,
      reconciliationMs: this.config.reconciliationMs,
    });
    await Promise.all(
      claims.map((claim) =>
        this.contexts.runBackground(claim.organizationId, async () => {
          const run = await this.authorizer.authorize(claim.runId, claim.leaseToken);
          await this.contexts.runAuthorizedBackgroundActor(run.organizationId, run.actor, () =>
            this.advance.tick({ runId: claim.runId, leaseToken: claim.leaseToken }),
          );
        }, 'EXECUTIONS'),
      ),
    );
    return claims.length;
  }
}
