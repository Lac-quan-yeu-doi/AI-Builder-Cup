import type {
  IWorkflowAccess,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelinePreparer } from '@application/data-workflow/interfaces/i-workflow-pipeline-preparer';
import type { IWorkflowPipelineDescriptor } from '@application/data-workflow/interfaces/i-workflow-pipeline-descriptor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowScheduleRepository } from '@application/data-workflow/interfaces/i-workflow-schedule-repository';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import type { ValidateWatchSourceTriggerUseCase } from '@application/data-workflow-watch-source/validate-watch-source-trigger.use-case';
import type { ReconcileCdcConnectorUseCase } from '@application/data-workflow-watch-source/reconcile-cdc-connector.use-case';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { WorkflowAuthoringError } from '@application/data-workflow/workflow-authoring.error';
import {
  automaticTrigger,
  pipelineReferences,
  parseWorkflowGraph,
  triggerSnapshot,
} from '@application/data-workflow/workflow-graph-input';
import type { DataWorkflowVersion } from '@domain/data-workflow/models/workflow-persistence';
import type { WorkflowWatchSourceTrigger } from '@domain/data-workflow/models/workflow-trigger';
import type { ValidateRunDataTargetsUseCase } from '@application/data-workflow/validate-run-data-targets.use-case';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';

type WatchSourceRepositoryForPublication = Pick<IWatchSourceRepository, 'synchronizePublication'> &
  Partial<Pick<IWatchSourceRepository, 'listActiveCdcDatabaseServiceIds'>>;
type CdcConnectorForPublication = Pick<ReconcileCdcConnectorUseCase, 'execute'> &
  Partial<Pick<ReconcileCdcConnectorUseCase, 'pause'>>;
type CdcTrigger = Extract<WorkflowWatchSourceTrigger, { type: 'WATCH_SOURCE'; mode: 'CDC' }>;

export class PublishWorkflowUseCase {
  public constructor(
    private readonly workflows: IWorkflowRepository,
    private readonly schedules: IWorkflowScheduleRepository,
    private readonly triggerSchedule: IWorkflowTriggerSchedule,
    private readonly unitOfWork: IUnitOfWork,
    private readonly access: IWorkflowAccess,
    private readonly preparer: IWorkflowPipelinePreparer,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly descriptor: IWorkflowPipelineDescriptor,
    private readonly watchSource?: Pick<ValidateWatchSourceTriggerUseCase, 'validate'>,
    private readonly watchSourceRepository?: WatchSourceRepositoryForPublication,
    private readonly cdcConnector?: CdcConnectorForPublication,
    private readonly runDataTargets?: Pick<ValidateRunDataTargetsUseCase, 'execute'>,
  ) {}

  public async execute(
    actor: WorkflowActor,
    workflowId: string,
    expectedRevision?: number,
  ): Promise<DataWorkflowVersion> {
    await this.access.require(actor, 'EDIT', workflowId);
    const current = await this.workflows.find(workflowId);
    if (current === undefined || current.organizationId !== actor.organizationId) {
      throw WorkflowAuthoringError.notFound();
    }
    if (
      expectedRevision !== undefined &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
    ) {
      throw WorkflowAuthoringError.revisionConflict();
    }

    const previousCdcDatabaseServiceIds =
      (await this.activeCdcDatabaseServiceIds(actor.organizationId)) ?? [];

    // Reparse the persisted JSON-shaped draft before publishing it. This prevents a
    // corrupt old draft from bypassing the authoring boundary as schema evolves.
    const graph = parseWorkflowGraph(current.draft);
    const hasRunDataConditions = graph.nodes.some(
      (node) => node.type === 'CONDITIONAL_SPLIT' && node.conditionKind === 'RUN_DATA',
    );
    if (hasRunDataConditions) {
      if (this.runDataTargets === undefined) {
        throw WorkflowAuthoringError.invalidGraph([
          { code: 'RUN_DATA_TARGET_VALIDATION_UNAVAILABLE' },
        ]);
      }
      await this.runDataTargets.execute(actor, graph);
    }
    const configuredTrigger = graph.nodes.find((node) => node.type === 'TRIGGER')?.config;
    let watchValidation:
      Awaited<ReturnType<ValidateWatchSourceTriggerUseCase['validate']>> | undefined;
    if (configuredTrigger?.type === 'WATCH_SOURCE') {
      watchValidation = await this.watchSource?.validate(actor, configuredTrigger);
      if (watchValidation === undefined || watchValidation.issues.length > 0) {
        throw WorkflowAuthoringError.invalidGraph();
      }
    }
    const pipelines = pipelineReferences(graph);
    for (const pipeline of pipelines) await this.access.requirePipeline(actor, pipeline);
    // Compilation can perform I/O; do it before the compare-and-swap publication write.
    for (const pipeline of pipelines) await this.preparer.prepare(actor, pipeline);
    const pipelineDisplayNames: Record<string, string> = {};
    for (const node of graph.nodes) {
      if (node.type !== 'PIPELINE') continue;
      const descriptor = await this.descriptor.describe(actor, {
        pipelineId: node.pipelineId,
        versionNumber: node.versionNumber,
      });
      pipelineDisplayNames[node.id] = descriptor.name;
    }

    const publishedAt = this.clock.now();
    const automatic = automaticTrigger(graph);
    const nextDueAt =
      automatic === undefined ? undefined : this.triggerSchedule.next(automatic, publishedAt);
    const version = await this.unitOfWork.commit(async () => {
      const published = await this.workflows.publish(workflowId, current.revision, {
        id: this.ids.next(),
        graph,
        trigger: triggerSnapshot(graph),
        pipelineDisplayNames,
        publishedAt,
      });
      if (published === false) return false;
      await this.schedules.synchronizePublication({
        id: this.ids.next(),
        organizationId: current.organizationId,
        workflowId: current.id,
        versionId: published.id,
        actor: actor.identityId,
        triggerKind: automatic?.type,
        nextDueAt,
        intervalAnchorAt: automatic?.type === 'INTERVAL' ? new Date(automatic.anchorAt) : undefined,
        now: publishedAt,
      });
      if (configuredTrigger?.type === 'WATCH_SOURCE') {
        if (this.watchSourceRepository === undefined) throw WorkflowAuthoringError.invalidGraph();
        await this.watchSourceRepository.synchronizePublication({
          organizationId: current.organizationId,
          workflowId: current.id,
          workflowVersionId: published.id,
          actor: actor.identityId,
          sourceId: this.ids.next(),
          subscriptionId: this.ids.next(),
          databaseServiceId: configuredTrigger.databaseServiceId,
          adapterKey:
            configuredTrigger.mode === 'CDC'
              ? 'DEBEZIUM_CDC'
              : `${watchValidation!.capabilities.connectorType}_POLLING`,
          adapterVersion: '1',
          trigger: configuredTrigger,
          now: publishedAt,
        });
      }
      return published;
    });
    if (version === false) throw WorkflowAuthoringError.revisionConflict();
    await this.reconcileCdcConnectors(
      actor.organizationId,
      configuredTrigger?.type === 'WATCH_SOURCE' && configuredTrigger.mode === 'CDC'
        ? configuredTrigger
        : undefined,
      previousCdcDatabaseServiceIds,
    );
    return version;
  }

  private async activeCdcDatabaseServiceIds(
    organizationId: string,
  ): Promise<readonly string[] | undefined> {
    if (this.watchSourceRepository?.listActiveCdcDatabaseServiceIds === undefined) return undefined;
    try {
      return await this.watchSourceRepository.listActiveCdcDatabaseServiceIds(organizationId);
    } catch {
      return undefined;
    }
  }

  private async reconcileCdcConnectors(
    organizationId: string,
    currentTrigger: CdcTrigger | undefined,
    previousDatabaseServiceIds: readonly string[],
  ): Promise<void> {
    if (this.cdcConnector === undefined) return;
    if (currentTrigger !== undefined) {
      try {
        await this.cdcConnector.execute({
          organizationId,
          databaseServiceId: currentTrigger.databaseServiceId,
          trigger: currentTrigger,
        });
      } catch {
        // Publication is durable; connector setup remains retryable from health.
      }
    }
    const active = await this.activeCdcDatabaseServiceIds(organizationId);
    if (active === undefined) return;
    const pause = this.cdcConnector.pause;
    if (pause === undefined) return;
    for (const databaseServiceId of previousDatabaseServiceIds) {
      if (active.includes(databaseServiceId)) continue;
      try {
        await pause(organizationId, databaseServiceId);
      } catch {
        // A connector cleanup failure is retryable and must not undo publication.
      }
    }
  }
}
