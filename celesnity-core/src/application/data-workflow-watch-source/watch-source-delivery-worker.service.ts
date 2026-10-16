import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import type {
  DataWorkflowWatchSourceDeliveryAssignment,
  DataWorkflowWatchSourceNotification,
  DataWorkflowWatchSourceSubscription,
} from '@domain/data-workflow-watch-source/models/watch-source-persistence';

export interface WatchSourceDeliveryWorkerConfig {
  readonly claimBatchSize: number;
  readonly leaseMs: number;
  readonly reconciliationBatchSize: number;
}

export interface WatchSourceDeliveryCycleResult {
  readonly claimed: number;
  readonly dispatched: number;
  readonly delivered: number;
  readonly blocked: number;
  readonly deferred: number;
}

interface Candidate {
  readonly assignment: DataWorkflowWatchSourceDeliveryAssignment;
  readonly subscription: DataWorkflowWatchSourceSubscription;
  readonly notification: DataWorkflowWatchSourceNotification;
}

/** Bridges durable Watch Source notifications into pinned workflow runs. */
export class WatchSourceDeliveryWorkerService {
  public constructor(
    private readonly repository: IWatchSourceRepository,
    private readonly workflows: IWorkflowRepository,
    private readonly runs: IWorkflowRunRepository,
    private readonly access: IWorkflowAccess,
    private readonly contexts: AuthenticatedContextStore,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly config: WatchSourceDeliveryWorkerConfig,
  ) {}

  public async dispatchOnce(): Promise<WatchSourceDeliveryCycleResult> {
    const owner = this.ids.next();
    const now = this.clock.now();
    const reconciliation = await this.reconcileDispatched();
    const assignments = await this.repository.claimDueAssignments({
      limit: this.config.claimBatchSize,
      owner,
      now,
      leaseMs: this.config.leaseMs,
    });
    const candidates: Candidate[] = [];
    let deferred = 0;
    for (const assignment of assignments) {
      let candidate: Candidate | undefined;
      try {
        candidate = await this.contexts.runBackground(
          assignment.organizationId,
          () => this.loadCandidate(assignment),
          'EXECUTIONS',
        );
      } catch {
        candidate = undefined;
      }
      if (candidate === undefined) {
        await this.repository.releaseClaim(assignment.id, owner, assignment.leaseToken ?? '');
        deferred += 1;
        continue;
      }
      candidates.push(candidate);
    }

    const groups = groupCandidates(candidates);
    let dispatched = 0;
    for (const group of groups) {
      const first = group[0]!;
      let result: 'DISPATCHED' | 'DEFERRED';
      try {
        result = await this.contexts.runBackground(
          first.assignment.organizationId,
          () => this.dispatchGroup(group, owner),
          'EXECUTIONS',
        );
      } catch {
        await this.releaseGroup(group, owner);
        result = 'DEFERRED';
      }
      if (result === 'DISPATCHED') dispatched += group.length;
      else deferred += group.length;
    }
    return {
      claimed: assignments.length,
      dispatched,
      delivered: reconciliation.delivered,
      blocked: reconciliation.blocked,
      deferred,
    };
  }

  private async loadCandidate(
    assignment: DataWorkflowWatchSourceDeliveryAssignment,
  ): Promise<Candidate | undefined> {
    const subscription = await this.repository.findSubscription(
      assignment.organizationId,
      assignment.subscriptionId,
    );
    const notification = await this.repository.findNotification(
      assignment.organizationId,
      assignment.notificationId,
    );
    if (
      subscription === undefined ||
      notification === undefined ||
      !subscription.enabled ||
      subscription.organizationId !== assignment.organizationId ||
      subscription.workflowId !== assignment.workflowId ||
      subscription.workflowVersionId !== assignment.workflowVersionId
    )
      return undefined;
    return { assignment, subscription, notification };
  }

  private async dispatchGroup(
    group: readonly Candidate[],
    owner: string,
  ): Promise<'DISPATCHED' | 'DEFERRED'> {
    const first = group[0]!;
    const workflow = await this.workflows.find(first.assignment.workflowId);
    const version = await this.workflows.findVersionById(first.assignment.workflowVersionId);
    if (
      workflow === undefined ||
      version === undefined ||
      workflow.organizationId !== first.assignment.organizationId ||
      version.organizationId !== first.assignment.organizationId ||
      version.workflowId !== first.assignment.workflowId
    ) {
      await this.releaseGroup(group, owner);
      return 'DEFERRED';
    }
    if (workflow.paused || (await this.runs.findActive(workflow.id)) !== undefined) {
      await this.releaseGroup(group, owner);
      return 'DEFERRED';
    }
    const actor: WorkflowActor = {
      organizationId: first.assignment.organizationId,
      identityId: first.subscription.actor,
    };
    try {
      await this.access.require(actor, 'RUN', workflow.id);
      for (const node of version.graph.nodes) {
        if (node.type === 'PIPELINE') {
          await this.access.requirePipeline(actor, {
            pipelineId: node.pipelineId,
            versionNumber: node.versionNumber,
          });
        }
      }
      const now = this.clock.now();
      const attached = await this.unitOfWork.commit(async () => {
        const run = await this.runs.createRun({
          id: this.ids.next(),
          organizationId: first.assignment.organizationId,
          workflowId: first.assignment.workflowId,
          versionId: first.assignment.workflowVersionId,
          actor: first.subscription.actor,
          parameters: {},
          triggerContext: watchSourceTriggerContext(group),
          now,
        });
        if (run === false) return false;
        const attached = await this.repository.attachAssignmentsToRun({
          workflowRunId: run.id,
          owner,
          assignments: group.map((item) => ({
            id: item.assignment.id,
            token: item.assignment.leaseToken ?? '',
          })),
          now,
        });
        if (!attached) throw new Error('Watch Source delivery lease was lost.');
        return true;
      });
      if (attached) return 'DISPATCHED';
    } catch {
      // Keep the source coverage pending for an explicit retry after authorization or persistence recovery.
    }
    await this.releaseGroup(group, owner);
    return 'DEFERRED';
  }

  private async releaseGroup(group: readonly Candidate[], owner: string): Promise<void> {
    await Promise.all(
      group.map((item) =>
        this.repository.releaseClaim(item.assignment.id, owner, item.assignment.leaseToken ?? ''),
      ),
    );
  }

  private async reconcileDispatched(): Promise<{ delivered: number; blocked: number }> {
    const assignments = await this.repository.listDispatchedAssignments(
      this.config.reconciliationBatchSize,
    );
    let delivered = 0;
    let blocked = 0;
    for (const assignment of assignments) {
      const runId = assignment.workflowRunId;
      if (runId === undefined) continue;
      const status = await this.contexts.runBackground(assignment.organizationId, async () => {
        const run = await this.runs.find(runId);
        if (run === undefined || run.status === 'FAILED' || run.status === 'CANCELLED') {
          return 'BLOCKED' as const;
        }
        if (run.status !== 'SUCCEEDED') return 'PENDING' as const;
        return 'DELIVERED' as const;
      }, 'EXECUTIONS');
      if (status === 'DELIVERED') {
        if (await this.repository.completeDeliveryForRun(assignment.id, runId, this.clock.now()))
          delivered += 1;
      } else if (status === 'BLOCKED') {
        if (await this.repository.blockDeliveryForRun(assignment.id, runId, this.clock.now()))
          blocked += 1;
      }
    }
    return { delivered, blocked };
  }
}

function groupCandidates(candidates: readonly Candidate[]): readonly (readonly Candidate[])[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.assignment.organizationId}:${candidate.assignment.workflowId}:${candidate.assignment.workflowVersionId}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function watchSourceTriggerContext(group: readonly Candidate[]): Readonly<Record<string, unknown>> {
  const first = group[0]!;
  return {
    type: 'WATCH_SOURCE',
    watchSourceId: first.notification.watchSourceId,
    notifications: group.map((candidate) => ({
      id: candidate.notification.id,
      relation: candidate.notification.relation,
      changeTypes: [...candidate.notification.changeTypes],
      checkpointFingerprint: candidate.notification.checkpointFingerprint,
      capturedAt: candidate.notification.capturedAt.toISOString(),
    })),
  };
}
