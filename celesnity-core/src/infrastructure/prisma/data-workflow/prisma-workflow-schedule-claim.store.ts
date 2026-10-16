import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import type {
  CompleteWorkflowScheduleClaimInput,
  IWorkflowScheduleClaimStore,
  ClaimDueWorkflowSchedulesInput,
  WorkflowScheduleClaim,
} from '@application/data-workflow/interfaces/i-workflow-schedule-claim-store';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

interface Candidate {
  id: string;
  organization_id: string;
  workflow_id: string;
  version_id: string;
  actor: string;
  trigger_kind: 'CALENDAR' | 'INTERVAL';
  next_due_at: Date;
  interval_anchor_at: Date | null;
  coalesced_from_at: Date | null;
  coalesced_through_at: Date | null;
  coalesced_count: number;
  revision: number;
}

@Injectable()
export class PrismaWorkflowScheduleClaimStore implements IWorkflowScheduleClaimStore {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}
  public async claimDue(
    input: ClaimDueWorkflowSchedulesInput,
  ): Promise<readonly WorkflowScheduleClaim[]> {
    if (input.limit < 1 || input.leaseMs < 1 || input.owner.trim() === '') return [];
    return this.unitOfWork.commit(async () => {
      const rows = await this.prisma.client.$queryRaw<readonly Candidate[]>(Prisma.sql`
        SELECT s.id, s.organization_id, s.workflow_id, s.version_id, s.actor, s.trigger_kind, s.next_due_at, s.interval_anchor_at, s.coalesced_from_at, s.coalesced_through_at, s.coalesced_count, s.revision
        FROM "celesnity_app"."data_workflow_schedules" s
        WHERE s.enabled = true AND s.superseded_at IS NULL
          AND (s.next_due_at <= ${input.now} OR (s.coalesced_count > 0 AND NOT EXISTS (SELECT 1 FROM "celesnity_app"."data_workflow_runs" r WHERE r.workflow_id = s.workflow_id AND r.organization_id = s.organization_id AND r.status IN ('QUEUED', 'RUNNING'))))
          AND (s.lease_expires_at IS NULL OR s.lease_expires_at <= ${input.now})
        ORDER BY s.next_due_at, s.id LIMIT ${input.limit} FOR UPDATE SKIP LOCKED
      `);
      const expires = new Date(input.now.getTime() + input.leaseMs);
      const result: WorkflowScheduleClaim[] = [];
      for (const row of rows) {
        const token = randomUUID();
        const changed = await this.prisma.client.$executeRaw(Prisma.sql`
          UPDATE "celesnity_app"."data_workflow_schedules" SET lease_owner=${input.owner.trim()}, lease_token=${token}::uuid, lease_expires_at=${expires}, revision=revision+1, updated_at=${input.now}
          WHERE id=${row.id}::uuid AND organization_id=${row.organization_id}::uuid AND revision=${row.revision} AND enabled=true AND superseded_at IS NULL
        `);
        if (changed === 1)
          result.push({
            scheduleId: row.id,
            organizationId: row.organization_id,
            workflowId: row.workflow_id,
            versionId: row.version_id,
            actor: row.actor,
            triggerKind: row.trigger_kind,
            nextDueAt: row.next_due_at,
            intervalAnchorAt: row.interval_anchor_at ?? undefined,
            coalescedFromAt: row.coalesced_from_at ?? undefined,
            coalescedThroughAt: row.coalesced_through_at ?? undefined,
            coalescedCount: row.coalesced_count,
            revision: row.revision + 1,
            leaseToken: token,
          });
      }
      return result;
    });
  }
  public complete(input: CompleteWorkflowScheduleClaimInput): Promise<boolean> {
    return this.unitOfWork.commit(
      async () =>
        (await this.prisma.client.$executeRaw(Prisma.sql`
      UPDATE "celesnity_app"."data_workflow_schedules" SET next_due_at=${input.nextDueAt}, coalesced_from_at=${input.coalescedFromAt ?? null}, coalesced_through_at=${input.coalescedThroughAt ?? null}, coalesced_count=${input.coalescedCount}, lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL, revision=revision+1, updated_at=${input.now}
      WHERE id=${input.claim.scheduleId}::uuid AND organization_id=${input.claim.organizationId}::uuid AND revision=${input.claim.revision} AND enabled=true AND superseded_at IS NULL AND lease_owner=${input.owner} AND lease_token=${input.claim.leaseToken}::uuid AND lease_expires_at > ${input.now}
    `)) === 1,
    );
  }
}
