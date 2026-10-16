import { randomUUID } from 'node:crypto';

import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type {
  IWorkflowScheduleClaimStore,
  WorkflowScheduleClaim,
} from '@application/data-workflow/interfaces/i-workflow-schedule-claim-store';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import { automaticTrigger } from '@application/data-workflow/workflow-graph-input';
import type { WorkflowAutomaticTrigger } from '@domain/data-workflow/models/workflow-trigger';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';

export interface DataWorkflowScheduleWorkerConfig {
  readonly batchSize: number;
  readonly leaseMs: number;
}

/** Claims global schedule state, then creates a version-pinned run in its tenant transaction. */
export class WorkflowScheduleWorkerService {
  private readonly owner: string;
  public constructor(
    private readonly claims: IWorkflowScheduleClaimStore,
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
    private readonly triggerSchedule: IWorkflowTriggerSchedule,
    private readonly contexts: AuthenticatedContextStore,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly config: DataWorkflowScheduleWorkerConfig,
    owner: string = randomUUID(),
  ) {
    this.owner = owner;
  }

  public async tick(): Promise<number> {
    const claimed = await this.claims.claimDue({
      limit: this.config.batchSize,
      owner: this.owner,
      now: this.clock.now(),
      leaseMs: this.config.leaseMs,
    });
    await Promise.all(
      claimed.map((claim) =>
        this.contexts.runBackground(claim.organizationId, () => this.process(claim), 'EXECUTIONS'),
      ),
    );
    return claimed.length;
  }

  private async process(claim: WorkflowScheduleClaim): Promise<void> {
    const now = this.clock.now();
    const workflow = await this.workflows.find(claim.workflowId);
    const version = await this.workflows.findVersionById(claim.versionId);
    if (
      workflow === undefined ||
      version === undefined ||
      workflow.organizationId !== claim.organizationId ||
      version.workflowId !== claim.workflowId ||
      version.organizationId !== claim.organizationId
    )
      return;
    const trigger = automaticTrigger(version.graph);
    if (trigger === undefined || trigger.type !== claim.triggerKind) return;
    const nextDueAt = this.triggerSchedule.next(trigger, now);
    if (isMissedCalendarOccurrence(claim, trigger, now)) {
      await this.claims.complete({
        claim,
        owner: this.owner,
        now,
        nextDueAt,
        coalescedCount: 0,
      });
      return;
    }
    const due = claim.nextDueAt.getTime() <= now.getTime();
    const coverage = mergeCoverage(
      claim,
      due ? occurrenceCoverage(claim, trigger, now) : undefined,
    );
    if (workflow.paused) {
      await this.claims.complete({ claim, owner: this.owner, now, nextDueAt, coalescedCount: 0 });
      return;
    }
    const active = await this.runs.findActive(claim.workflowId);
    if (active !== undefined) {
      await this.claims.complete({ claim, owner: this.owner, now, nextDueAt, ...coverage });
      return;
    }
    const actor = { organizationId: claim.organizationId, identityId: claim.actor };
    await this.access.require(actor, 'RUN', claim.workflowId);
    for (const node of version.graph.nodes)
      if (node.type === 'PIPELINE')
        await this.access.requirePipeline(actor, {
          pipelineId: node.pipelineId,
          versionNumber: node.versionNumber,
        });
    await this.unitOfWork.commit(async () => {
      const created = await this.runs.createRun({
        id: this.ids.next(),
        organizationId: claim.organizationId,
        workflowId: claim.workflowId,
        versionId: claim.versionId,
        actor: claim.actor,
        parameters: {},
        triggerContext: {
          type: 'SCHEDULE',
          scheduleId: claim.scheduleId,
          triggerKind: claim.triggerKind,
          occurrence: coverage,
        },
        now,
      });
      if (created === false) {
        const saved = await this.claims.complete({
          claim,
          owner: this.owner,
          now,
          nextDueAt,
          ...coverage,
        });
        if (!saved) throw new Error('Workflow schedule lease was lost.');
        return;
      }
      const saved = await this.claims.complete({
        claim,
        owner: this.owner,
        now,
        nextDueAt,
        coalescedCount: 0,
      });
      if (!saved) throw new Error('Workflow schedule lease was lost.');
    });
  }
}

/** Calendar expressions have minute precision, so lateness within the minute is valid. */
function isMissedCalendarOccurrence(
  claim: WorkflowScheduleClaim,
  trigger: WorkflowAutomaticTrigger,
  now: Date,
): boolean {
  if (trigger.type !== 'CALENDAR') return false;
  return utcMinute(claim.nextDueAt) < utcMinute(now);
}

function utcMinute(value: Date): number {
  return Math.floor(value.getTime() / 60_000);
}

function occurrenceCoverage(
  claim: WorkflowScheduleClaim,
  trigger: WorkflowAutomaticTrigger,
  now: Date,
): {
  readonly coalescedFromAt: Date;
  readonly coalescedThroughAt: Date;
  readonly coalescedCount: number;
} {
  if (trigger.type === 'CALENDAR')
    return {
      coalescedFromAt: claim.nextDueAt,
      coalescedThroughAt: claim.nextDueAt,
      coalescedCount: 1,
    };
  const milliseconds = trigger.everySeconds * 1_000;
  const count = Math.floor((now.getTime() - claim.nextDueAt.getTime()) / milliseconds) + 1;
  return {
    coalescedFromAt: claim.nextDueAt,
    coalescedThroughAt: new Date(claim.nextDueAt.getTime() + (count - 1) * milliseconds),
    coalescedCount: count,
  };
}

function mergeCoverage(
  claim: WorkflowScheduleClaim,
  next?: {
    readonly coalescedFromAt?: Date;
    readonly coalescedThroughAt?: Date;
    readonly coalescedCount: number;
  },
): {
  readonly coalescedFromAt?: Date;
  readonly coalescedThroughAt?: Date;
  readonly coalescedCount: number;
} {
  if (next === undefined)
    return {
      coalescedFromAt: claim.coalescedFromAt,
      coalescedThroughAt: claim.coalescedThroughAt,
      coalescedCount: claim.coalescedCount,
    };
  return {
    coalescedFromAt: claim.coalescedFromAt ?? next.coalescedFromAt,
    coalescedThroughAt: next.coalescedThroughAt ?? claim.coalescedThroughAt,
    coalescedCount: claim.coalescedCount + next.coalescedCount,
  };
}
