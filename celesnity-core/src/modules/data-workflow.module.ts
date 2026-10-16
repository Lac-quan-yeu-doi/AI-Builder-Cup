import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CreateWorkflowUseCase } from '@application/data-workflow/create-workflow.use-case';
import { ListWorkflowPipelineTargetsUseCase } from '@application/data-workflow/list-workflow-pipeline-targets.use-case';
import { ValidateRunDataTargetsUseCase } from '@application/data-workflow/validate-run-data-targets.use-case';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowTargetSchemaReader } from '@application/data-workflow/interfaces/i-workflow-target-schema-reader';
import type { IWorkflowPipelinePreparer } from '@application/data-workflow/interfaces/i-workflow-pipeline-preparer';
import type { IWorkflowPipelineDescriptor } from '@application/data-workflow/interfaces/i-workflow-pipeline-descriptor';
import type { IWorkflowPipelineExecutor } from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { IWorkflowScheduleRepository } from '@application/data-workflow/interfaces/i-workflow-schedule-repository';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import { PublishWorkflowUseCase } from '@application/data-workflow/publish-workflow.use-case';
import { PreviewWorkflowCalendarUseCase } from '@application/data-workflow/preview-workflow-calendar.use-case';
import {
  GetWorkflowRunUseCase,
  ListWorkflowRunsUseCase,
} from '@application/data-workflow/read-workflow-run.use-cases';
import {
  GetWorkflowUseCase,
  ListWorkflowVersionsUseCase,
  ListWorkflowsUseCase,
} from '@application/data-workflow/read-workflow.use-cases';
import { GetWorkflowScheduleUseCase } from '@application/data-workflow/read-workflow-schedule.use-case';
import { RetryWorkflowNodeUseCase } from '@application/data-workflow/retry-workflow-node.use-case';
import { SetWorkflowPausedUseCase } from '@application/data-workflow/set-workflow-paused.use-case';
import { StartWorkflowRunUseCase } from '@application/data-workflow/start-workflow-run.use-case';
import {
  WORKFLOW_ACCESS,
  WORKFLOW_PIPELINE_EXECUTOR,
  WORKFLOW_PIPELINE_PREPARER,
  WORKFLOW_PIPELINE_DESCRIPTOR,
  WORKFLOW_TARGET_SCHEMA_READER,
  WORKFLOW_REPOSITORY,
  WORKFLOW_RUN_REPOSITORY,
  WORKFLOW_SCHEDULE_REPOSITORY,
  WORKFLOW_TRIGGER_SCHEDULE,
} from '@application/data-workflow/tokens';
import { UpdateWorkflowUseCase } from '@application/data-workflow/update-workflow.use-case';
import type { IWatchSourceAccess } from '@application/data-workflow-watch-source/interfaces/i-watch-source-access';
import type { IWatchSourceCapabilityRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-capability-registry';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { ListWatchSourceCatalogUseCase } from '@application/data-workflow-watch-source/list-watch-source-catalog.use-case';
import { ValidateWatchSourceTriggerUseCase } from '@application/data-workflow-watch-source/validate-watch-source-trigger.use-case';
import {
  WATCH_SOURCE_ACCESS,
  WATCH_SOURCE_CAPABILITY_REGISTRY,
  CDC_CONNECTOR_MANAGER,
  WATCH_SOURCE_REPOSITORY,
} from '@application/data-workflow-watch-source/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { CronWorkflowTriggerSchedule } from '@infrastructure/data-workflow/cron-workflow-trigger-schedule';
import { WorkflowPipelinePreparerAdapter } from '@infrastructure/data-workflow/workflow-pipeline-preparer.adapter';
import { WorkflowPipelineDescriptorAdapter } from '@infrastructure/data-workflow/workflow-pipeline-descriptor.adapter';
import { WorkflowTargetSchemaReader } from '@infrastructure/data-workflow/workflow-target-schema.reader';
import { WatchSourceAccessAdapter } from '@infrastructure/data-workflow-watch-source/watch-source-access.adapter';
import { WatchSourceCapabilityRegistry } from '@infrastructure/data-workflow-watch-source/watch-source-capability.registry';
import { DebeziumConnectClient } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';
import { DebeziumConnectorConfigFactory } from '@infrastructure/data-workflow-watch-source/debezium-connector-config.factory';
import { DebeziumConnectorManager } from '@infrastructure/data-workflow-watch-source/debezium-connector.manager';
import { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';
import { ReconcileCdcConnectorUseCase } from '@application/data-workflow-watch-source/reconcile-cdc-connector.use-case';
import type { ICdcConnectorManager } from '@application/data-workflow-watch-source/interfaces/i-cdc-connector-manager';
import { CDC_CONNECTION_RUNTIME_PROVIDER } from '@application/database-service/tokens';
import type { ICdcConnectionRuntimeProvider } from '@application/database-service/interfaces/i-cdc-connection-runtime-provider';
import { PrismaWatchSourceRepository } from '@infrastructure/prisma/data-workflow-watch-source/prisma-watch-source.repository';
import { PrismaWorkflowRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow.repository';
import { PrismaWorkflowRunRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-run.repository';
import { PrismaWorkflowScheduleRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule.repository';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { ExecutionOrchestrationModule } from '@modules/execution-orchestration.module';
import { PipelineCompilationModule } from '@modules/pipeline-compilation.module';
import { PipelineAuthoringModule } from '@modules/pipeline-authoring.module';
import { NodeCatalogModule } from '@modules/node-catalog.module';
import { DataWorkflowController } from '@presentation/data-workflow/data-workflow.controller';
import { DataWorkflowRunController } from '@presentation/data-workflow/data-workflow-run.controller';
import { WorkflowPipelineTargetsController } from '@presentation/data-workflow/workflow-pipeline-targets.controller';
import { WatchSourceController } from '@presentation/data-workflow-watch-source/watch-source.controller';

@Module({
  imports: [
    ExecutionOrchestrationModule,
    PipelineCompilationModule,
    PipelineAuthoringModule,
    NodeCatalogModule,
    DatabaseServiceModule,
  ],
  controllers: [
    DataWorkflowController,
    DataWorkflowRunController,
    WorkflowPipelineTargetsController,
    WatchSourceController,
  ],
  providers: [
    PrismaWorkflowRepository,
    PrismaWorkflowRunRepository,
    PrismaWorkflowScheduleRepository,
    WorkflowPipelinePreparerAdapter,
    WorkflowPipelineDescriptorAdapter,
    WorkflowTargetSchemaReader,
    WatchSourceAccessAdapter,
    PrismaWatchSourceRepository,
    DebeziumConnectClient,
    {
      provide: DebeziumConnectorConfigFactory,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DebeziumConnectorConfigFactory =>
        new DebeziumConnectorConfigFactory(config.getOrThrow<string>('DATA_WORKFLOW_CDC_TOPIC')),
    },
    {
      provide: CdcSourcePreflight,
      useFactory: (): CdcSourcePreflight => new CdcSourcePreflight(),
    },
    {
      provide: DebeziumConnectorManager,
      inject: [DebeziumConnectClient, DebeziumConnectorConfigFactory, CdcSourcePreflight],
      useFactory: (
        client: DebeziumConnectClient,
        factory: DebeziumConnectorConfigFactory,
        sourcePreflight: CdcSourcePreflight,
      ): DebeziumConnectorManager => new DebeziumConnectorManager(client, factory, sourcePreflight),
    },
    SystemClock,
    RandomUuidGenerator,
    { provide: WORKFLOW_REPOSITORY, useExisting: PrismaWorkflowRepository },
    { provide: WORKFLOW_RUN_REPOSITORY, useExisting: PrismaWorkflowRunRepository },
    { provide: WORKFLOW_SCHEDULE_REPOSITORY, useExisting: PrismaWorkflowScheduleRepository },
    {
      provide: WORKFLOW_TRIGGER_SCHEDULE,
      useFactory: (): CronWorkflowTriggerSchedule => new CronWorkflowTriggerSchedule(),
    },
    { provide: WORKFLOW_PIPELINE_PREPARER, useExisting: WorkflowPipelinePreparerAdapter },
    { provide: WORKFLOW_PIPELINE_DESCRIPTOR, useExisting: WorkflowPipelineDescriptorAdapter },
    { provide: WORKFLOW_TARGET_SCHEMA_READER, useExisting: WorkflowTargetSchemaReader },
    { provide: WATCH_SOURCE_ACCESS, useExisting: WatchSourceAccessAdapter },
    { provide: WATCH_SOURCE_REPOSITORY, useExisting: PrismaWatchSourceRepository },
    { provide: CDC_CONNECTOR_MANAGER, useExisting: DebeziumConnectorManager },
    {
      provide: ReconcileCdcConnectorUseCase,
      inject: [CDC_CONNECTION_RUNTIME_PROVIDER, CDC_CONNECTOR_MANAGER, WATCH_SOURCE_REPOSITORY],
      useFactory: (
        runtimeProvider: ICdcConnectionRuntimeProvider,
        manager: ICdcConnectorManager,
        watchSources: IWatchSourceRepository,
      ): ReconcileCdcConnectorUseCase =>
        new ReconcileCdcConnectorUseCase(runtimeProvider, manager, watchSources),
    },
    {
      provide: WATCH_SOURCE_CAPABILITY_REGISTRY,
      useFactory: (): WatchSourceCapabilityRegistry => new WatchSourceCapabilityRegistry(),
    },
    {
      provide: ValidateWatchSourceTriggerUseCase,
      inject: [
        WATCH_SOURCE_ACCESS,
        WATCH_SOURCE_CAPABILITY_REGISTRY,
        CDC_CONNECTION_RUNTIME_PROVIDER,
        CDC_CONNECTOR_MANAGER,
      ],
      useFactory: (
        access: IWatchSourceAccess,
        registry: IWatchSourceCapabilityRegistry,
        runtimeProvider: ICdcConnectionRuntimeProvider,
        cdcManager: ICdcConnectorManager,
      ): ValidateWatchSourceTriggerUseCase =>
        new ValidateWatchSourceTriggerUseCase(access, registry, runtimeProvider, cdcManager),
    },
    {
      provide: ListWatchSourceCatalogUseCase,
      inject: [WATCH_SOURCE_ACCESS],
      useFactory: (access: IWatchSourceAccess): ListWatchSourceCatalogUseCase =>
        new ListWatchSourceCatalogUseCase(access),
    },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: CreateWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS, CLOCK, ID_GENERATOR],
      useFactory: (
        workflows: IWorkflowRepository,
        access: IWorkflowAccess,
        clock: IClock,
        ids: IIdGenerator,
      ): CreateWorkflowUseCase => new CreateWorkflowUseCase(workflows, access, clock, ids),
    },
    {
      provide: UpdateWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS, CLOCK],
      useFactory: (
        workflows: IWorkflowRepository,
        access: IWorkflowAccess,
        clock: IClock,
      ): UpdateWorkflowUseCase => new UpdateWorkflowUseCase(workflows, access, clock),
    },
    {
      provide: SetWorkflowPausedUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS, CLOCK],
      useFactory: (
        workflows: IWorkflowRepository,
        access: IWorkflowAccess,
        clock: IClock,
      ): SetWorkflowPausedUseCase => new SetWorkflowPausedUseCase(workflows, access, clock),
    },
    {
      provide: PublishWorkflowUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WORKFLOW_SCHEDULE_REPOSITORY,
        WORKFLOW_TRIGGER_SCHEDULE,
        UNIT_OF_WORK,
        WORKFLOW_ACCESS,
        WORKFLOW_PIPELINE_PREPARER,
        WORKFLOW_PIPELINE_DESCRIPTOR,
        CLOCK,
        ID_GENERATOR,
        ValidateWatchSourceTriggerUseCase,
        WATCH_SOURCE_REPOSITORY,
        ReconcileCdcConnectorUseCase,
        ValidateRunDataTargetsUseCase,
      ],
      useFactory: (
        workflows: IWorkflowRepository,
        schedules: IWorkflowScheduleRepository,
        triggerSchedule: IWorkflowTriggerSchedule,
        unitOfWork: IUnitOfWork,
        access: IWorkflowAccess,
        preparer: IWorkflowPipelinePreparer,
        descriptor: IWorkflowPipelineDescriptor,
        clock: IClock,
        ids: IIdGenerator,
        watchSource: ValidateWatchSourceTriggerUseCase,
        watchSourceRepository: IWatchSourceRepository,
        cdcConnector: ReconcileCdcConnectorUseCase,
        runDataTargets: ValidateRunDataTargetsUseCase,
      ): PublishWorkflowUseCase =>
        new PublishWorkflowUseCase(
          workflows,
          schedules,
          triggerSchedule,
          unitOfWork,
          access,
          preparer,
          clock,
          ids,
          descriptor,
          watchSource,
          watchSourceRepository,
          cdcConnector,
          runDataTargets,
        ),
    },
    {
      provide: ListWorkflowsUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (workflows: IWorkflowRepository, access: IWorkflowAccess): ListWorkflowsUseCase =>
        new ListWorkflowsUseCase(workflows, access),
    },
    {
      provide: ListWorkflowPipelineTargetsUseCase,
      inject: [WORKFLOW_ACCESS, WORKFLOW_TARGET_SCHEMA_READER],
      useFactory: (
        access: IWorkflowAccess,
        schemas: IWorkflowTargetSchemaReader,
      ): ListWorkflowPipelineTargetsUseCase =>
        new ListWorkflowPipelineTargetsUseCase(access, schemas),
    },
    {
      provide: ValidateRunDataTargetsUseCase,
      inject: [WORKFLOW_ACCESS, WORKFLOW_TARGET_SCHEMA_READER],
      useFactory: (
        access: IWorkflowAccess,
        schemas: IWorkflowTargetSchemaReader,
      ): ValidateRunDataTargetsUseCase => new ValidateRunDataTargetsUseCase(access, schemas),
    },
    {
      provide: GetWorkflowUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (workflows: IWorkflowRepository, access: IWorkflowAccess): GetWorkflowUseCase =>
        new GetWorkflowUseCase(workflows, access),
    },
    {
      provide: ListWorkflowVersionsUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (
        workflows: IWorkflowRepository,
        access: IWorkflowAccess,
      ): ListWorkflowVersionsUseCase => new ListWorkflowVersionsUseCase(workflows, access),
    },
    {
      provide: GetWorkflowScheduleUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_SCHEDULE_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (
        workflows: IWorkflowRepository,
        schedules: IWorkflowScheduleRepository,
        access: IWorkflowAccess,
      ): GetWorkflowScheduleUseCase => new GetWorkflowScheduleUseCase(workflows, schedules, access),
    },
    {
      provide: PreviewWorkflowCalendarUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_ACCESS, WORKFLOW_TRIGGER_SCHEDULE, CLOCK],
      useFactory: (
        workflows: IWorkflowRepository,
        access: IWorkflowAccess,
        triggerSchedule: IWorkflowTriggerSchedule,
        clock: IClock,
      ): PreviewWorkflowCalendarUseCase =>
        new PreviewWorkflowCalendarUseCase(workflows, access, triggerSchedule, clock),
    },
    {
      provide: StartWorkflowRunUseCase,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_RUN_REPOSITORY, WORKFLOW_ACCESS, CLOCK, ID_GENERATOR],
      useFactory: (
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
        clock: IClock,
        ids: IIdGenerator,
      ): StartWorkflowRunUseCase =>
        new StartWorkflowRunUseCase(workflows, runs, access, clock, ids),
    },
    {
      provide: RetryWorkflowNodeUseCase,
      inject: [
        WORKFLOW_REPOSITORY,
        WORKFLOW_RUN_REPOSITORY,
        WORKFLOW_ACCESS,
        WORKFLOW_PIPELINE_EXECUTOR,
        CLOCK,
        ID_GENERATOR,
      ],
      useFactory: (
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
        executor: IWorkflowPipelineExecutor,
        clock: IClock,
        ids: IIdGenerator,
      ): RetryWorkflowNodeUseCase =>
        new RetryWorkflowNodeUseCase(workflows, runs, access, executor, clock, ids),
    },
    {
      provide: ListWorkflowRunsUseCase,
      inject: [WORKFLOW_RUN_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
      ): ListWorkflowRunsUseCase => new ListWorkflowRunsUseCase(runs, access),
    },
    {
      provide: GetWorkflowRunUseCase,
      inject: [WORKFLOW_RUN_REPOSITORY, WORKFLOW_ACCESS],
      useFactory: (runs: IWorkflowRunRepository, access: IWorkflowAccess): GetWorkflowRunUseCase =>
        new GetWorkflowRunUseCase(runs, access),
    },
  ],
})
export class DataWorkflowModule {}
