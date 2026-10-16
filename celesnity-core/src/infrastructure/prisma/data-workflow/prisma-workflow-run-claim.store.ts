import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';

import type {
  ClaimDueWorkflowRunsInput,
  IWorkflowRunClaimStore,
  WorkflowRunClaim,
} from '@application/data-workflow/interfaces/i-workflow-run-claim-store';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

interface ClaimCandidate {
  readonly id: string;
  readonly organization_id: string;
  readonly revision: number;
}

/**
 * Deliberately the only data-workflow adapter allowed to discover work across
 * organizations. It returns identifiers and a fencing token only; processing is
 * forced back through an AuthenticatedContextStore tenant boundary.
 */
@Injectable()
export class PrismaWorkflowRunClaimStore implements IWorkflowRunClaimStore {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async claimDue(input: ClaimDueWorkflowRunsInput): Promise<readonly WorkflowRunClaim[]> {
    if (
      input.limit < 1 ||
      input.leaseMs < 1 ||
      input.reconciliationMs < 1 ||
      input.owner.trim().length === 0
    ) {
      return [];
    }
    return this.unitOfWork.commit(async () => {
      const candidates = await this.prisma.client.$queryRaw<readonly ClaimCandidate[]>(Prisma.sql`
        SELECT id, organization_id, revision
        FROM "celesnity_app"."data_workflow_runs"
        WHERE (
          status = 'QUEUED' AND next_reconciliation_at <= ${input.now}
        ) OR (
          status = 'RUNNING' AND (
            lease_expires_at <= ${input.now}
            OR (lease_owner = ${input.owner.trim()} AND next_reconciliation_at <= ${input.now})
          )
        )
        ORDER BY next_reconciliation_at, created_at, id
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `);
      const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
      const nextReconciliationAt = new Date(input.now.getTime() + input.reconciliationMs);
      const claimed: WorkflowRunClaim[] = [];
      for (const candidate of candidates) {
        const leaseToken = randomUUID();
        const changed = await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_runs"
          SET
            status = 'RUNNING',
            revision = revision + 1,
            lease_owner = ${input.owner.trim()},
            lease_token = ${leaseToken}::uuid,
            lease_expires_at = ${leaseExpiresAt},
            next_reconciliation_at = ${nextReconciliationAt},
            updated_at = ${input.now}
          WHERE id = ${candidate.id}::uuid
            AND organization_id = ${candidate.organization_id}::uuid
            AND revision = ${candidate.revision}
        `);
        if (changed === 1) {
          claimed.push({
            runId: candidate.id,
            organizationId: candidate.organization_id,
            leaseToken,
          });
        }
      }
      return claimed;
    });
  }
}
