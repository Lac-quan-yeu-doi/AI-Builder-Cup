import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedContextStore } from '@application/administration/authenticated-context';
import { DATABASE_SERVICE_RUNTIME_PROVIDER } from '@application/database-service/tokens';
import type { IDatabaseServiceRuntimeProvider } from '@application/database-service/interfaces/i-database-service-runtime-provider';
import { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import {
  DataWorkflowWorkerService,
  type DataWorkflowWorkerConfig,
} from '@application/data-workflow/data-workflow-worker.service';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type { IWorkflowPipelineExecutor } from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunClaimStore } from '@application/data-workflow/interfaces/i-workflow-run-claim-store';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { IWorkflowScheduleClaimStore } from '@application/data-workflow/interfaces/i-workflow-schedule-claim-store';
import type { IWorkflowTriggerSchedule } from '@application/data-workflow/interfaces/i-workflow-trigger-schedule';
import { WorkflowScheduleWorkerService } from '@application/data-workflow/workflow-schedule-worker.service';
import {
  WORKFLOW_ACCESS,
  WORKFLOW_PIPELINE_EXECUTOR,
  WORKFLOW_REPOSITORY,
  WORKFLOW_RUN_CLAIM_STORE,
  WORKFLOW_RUN_REPOSITORY,
  WORKFLOW_SCHEDULE_CLAIM_STORE,
  WORKFLOW_TRIGGER_SCHEDULE,
} from '@application/data-workflow/tokens';
import { WorkflowRunAuthorizationService } from '@application/data-workflow/workflow-run-authorization.service';
import { EstablishWatchSourceBaselineUseCase } from '@application/data-workflow-watch-source/establish-watch-source-baseline.use-case';
import { IngestCdcEventUseCase } from '@application/data-workflow-watch-source/ingest-cdc-event.use-case';
import type { IWatchSourcePollingAdapterRegistry } from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter-registry';
import type { IWatchSourceRepository } from '@application/data-workflow-watch-source/interfaces/i-watch-source-repository';
import { RecordWatchSourceCaptureUseCase } from '@application/data-workflow-watch-source/record-watch-source-capture.use-case';
import {
  WATCH_SOURCE_POLLING_ADAPTER_REGISTRY,
  WATCH_SOURCE_REPOSITORY,
} from '@application/data-workflow-watch-source/tokens';
import {
  WatchSourcePollingWorkerService,
  type WatchSourcePollingWorkerConfig,
} from '@application/data-workflow-watch-source/watch-source-polling-worker.service';
import {
  WatchSourceDeliveryWorkerService,
  type WatchSourceDeliveryWorkerConfig,
} from '@application/data-workflow-watch-source/watch-source-delivery-worker.service';
import { SealCdcWindowsService } from '@application/data-workflow-watch-source/seal-cdc-windows.service';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { ExecutionOrchestrationModule } from '@modules/execution-orchestration.module';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { WatchSourcePollingAdapterRegistry } from '@infrastructure/data-workflow-watch-source/watch-source-polling-adapter.registry';
import { KafkaCdcEventConsumer } from '@infrastructure/data-workflow-watch-source/kafka-cdc-event.consumer';
import { DebeziumConnectClient } from '@infrastructure/data-workflow-watch-source/debezium-connect.client';
import { DebeziumConnectorConfigFactory } from '@infrastructure/data-workflow-watch-source/debezium-connector-config.factory';
import { DebeziumConnectorManager } from '@infrastructure/data-workflow-watch-source/debezium-connector.manager';
import { CdcSourcePreflight } from '@infrastructure/data-workflow-watch-source/cdc-source-preflight';
import { MysqlWatchSourceAdapter } from '@infrastructure/dbms/mysql/mysql-watch-source.adapter';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { PostgresWatchSourceAdapter } from '@infrastructure/dbms/postgresql/postgres-watch-source.adapter';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PrismaWatchSourceRepository } from '@infrastructure/prisma/data-workflow-watch-source/prisma-watch-source.repository';
import { PrismaWorkflowRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow.repository';
import { PrismaWorkflowRunClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-run-claim.store';
import { PrismaWorkflowRunRepository } from '@infrastructure/prisma/data-workflow/prisma-workflow-run.repository';
import { PrismaWorkflowScheduleClaimStore } from '@infrastructure/prisma/data-workflow/prisma-workflow-schedule-claim.store';
import { CronWorkflowTriggerSchedule } from '@infrastructure/data-workflow/cron-workflow-trigger-schedule';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { DataWorkflowWorker } from '@infrastructure/worker/data-workflow/data-workflow.worker';
import { WatchSourcePollingWorker } from '@infrastructure/worker/data-workflow/watch-source-polling.worker';
import { WatchSourceDeliveryWorker } from '@infrastructure/worker/data-workflow/watch-source-delivery.worker';
import { WatchSourceCdcWorker } from '@infrastructure/worker/data-workflow/watch-source-cdc.worker';
import { WorkflowScheduleWorker } from '@infrastructure/worker/data-workflow/workflow-schedule.worker';

@Module({
  imports: [ExecutionOrchestrationModule, DatabaseServiceModule],
  providers: [
    PrismaWorkflowRepository,
    PrismaWorkflowRunRepository,
    PrismaWorkflowRunClaimStore,
    PrismaWorkflowScheduleClaimStore,
    PrismaWatchSourceRepository,
    EstablishWatchSourceBaselineUseCase,
    RecordWatchSourceCaptureUseCase,
    KafkaCdcEventConsumer,
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
    { provide: WORKFLOW_RUN_CLAIM_STORE, useExisting: PrismaWorkflowRunClaimStore },
    { provide: WORKFLOW_SCHEDULE_CLAIM_STORE, useExisting: PrismaWorkflowScheduleClaimStore },
    { provide: WATCH_SOURCE_REPOSITORY, useExisting: PrismaWatchSourceRepository },
    {
      provide: IngestCdcEventUseCase,
      inject: [WATCH_SOURCE_REPOSITORY, CLOCK],
      useFactory: (
        repository: IWatchSourceRepository,
        clock: IClock,
      ): IngestCdcEventUseCase => new IngestCdcEventUseCase(repository, clock),
    },
    {
      provide: SealCdcWindowsService,
      inject: [WATCH_SOURCE_REPOSITORY, CLOCK, ConfigService],
      useFactory: (
        repository: IWatchSourceRepository,
        clock: IClock,
        config: ConfigService,
      ): SealCdcWindowsService =>
        new SealCdcWindowsService(repository, clock, {
          batchSize: config.get<number>('DATA_WORKFLOW_WATCH_SOURCE_RECONCILIATION_BATCH_SIZE', 100),
        }),
    },
    {
      provide: WATCH_SOURCE_POLLING_ADAPTER_REGISTRY,
      inject: [PostgresConfigCodec, MysqlConfigCodec],
      useFactory: (
        postgres: PostgresConfigCodec,
        mysql: MysqlConfigCodec,
      ): WatchSourcePollingAdapterRegistry =>
        new WatchSourcePollingAdapterRegistry([
          new PostgresWatchSourceAdapter(postgres),
          new MysqlWatchSourceAdapter(mysql),
        ]),
    },
    {
      provide: WORKFLOW_TRIGGER_SCHEDULE,
      useFactory: (): CronWorkflowTriggerSchedule => new CronWorkflowTriggerSchedule(),
    },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: WorkflowRunAuthorizationService,
      inject: [WORKFLOW_REPOSITORY, WORKFLOW_RUN_REPOSITORY, WORKFLOW_ACCESS, CLOCK],
      useFactory: (
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
        clock: IClock,
      ): WorkflowRunAuthorizationService =>
        new WorkflowRunAuthorizationService(workflows, runs, access, clock),
    },
    {
      provide: AdvanceWorkflowRunService,
      inject: [
        WORKFLOW_REPOSITORY,
        WORKFLOW_RUN_REPOSITORY,
        WORKFLOW_PIPELINE_EXECUTOR,
        CLOCK,
        ID_GENERATOR,
      ],
      useFactory: (
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        executor: IWorkflowPipelineExecutor,
        clock: IClock,
        ids: IIdGenerator,
      ): AdvanceWorkflowRunService =>
        new AdvanceWorkflowRunService(workflows, runs, executor, clock, ids),
    },
    {
      provide: DataWorkflowWorkerService,
      inject: [
        WORKFLOW_RUN_CLAIM_STORE,
        WorkflowRunAuthorizationService,
        AdvanceWorkflowRunService,
        AuthenticatedContextStore,
        CLOCK,
        ConfigService,
      ],
      useFactory: (
        claims: IWorkflowRunClaimStore,
        authorizer: WorkflowRunAuthorizationService,
        advance: AdvanceWorkflowRunService,
        contexts: AuthenticatedContextStore,
        clock: IClock,
        config: ConfigService,
      ): DataWorkflowWorkerService => {
        const workerConfig: DataWorkflowWorkerConfig = {
          batchSize: config.getOrThrow<number>('DATA_WORKFLOW_CLAIM_BATCH_SIZE'),
          leaseMs: config.getOrThrow<number>('DATA_WORKFLOW_LEASE_MS'),
          reconciliationMs: config.getOrThrow<number>('DATA_WORKFLOW_RECONCILIATION_INTERVAL_MS'),
        };
        return new DataWorkflowWorkerService(
          claims,
          authorizer,
          advance,
          contexts,
          clock,
          workerConfig,
        );
      },
    },
    {
      provide: DataWorkflowWorker,
      inject: [DataWorkflowWorkerService, ConfigService],
      useFactory: (service: DataWorkflowWorkerService, config: ConfigService): DataWorkflowWorker =>
        new DataWorkflowWorker(service, {
          pollIntervalMs: config.getOrThrow<number>('DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS'),
        }),
    },
    {
      provide: WatchSourcePollingWorkerService,
      inject: [
        WATCH_SOURCE_REPOSITORY,
        DATABASE_SERVICE_RUNTIME_PROVIDER,
        WATCH_SOURCE_POLLING_ADAPTER_REGISTRY,
        AuthenticatedContextStore,
        EstablishWatchSourceBaselineUseCase,
        RecordWatchSourceCaptureUseCase,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        repository: IWatchSourceRepository,
        runtimeProvider: IDatabaseServiceRuntimeProvider,
        adapters: IWatchSourcePollingAdapterRegistry,
        contexts: AuthenticatedContextStore,
        baseline: EstablishWatchSourceBaselineUseCase,
        capture: RecordWatchSourceCaptureUseCase,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): WatchSourcePollingWorkerService => {
        const workerConfig: WatchSourcePollingWorkerConfig = {
          claimBatchSize: config.getOrThrow<number>('DATA_WORKFLOW_CLAIM_BATCH_SIZE'),
          leaseMs: config.getOrThrow<number>('DATA_WORKFLOW_LEASE_MS'),
          pollLimit: config.get<number>('DATA_WORKFLOW_WATCH_SOURCE_POLL_LIMIT', 1000),
          timeoutMs: config.get<number>('DATA_WORKFLOW_WATCH_SOURCE_TIMEOUT_MS', 30_000),
        };
        return new WatchSourcePollingWorkerService(
          repository,
          runtimeProvider,
          adapters,
          contexts,
          baseline,
          capture,
          clock,
          ids,
          workerConfig,
        );
      },
    },
    {
      provide: WatchSourcePollingWorker,
      inject: [WatchSourcePollingWorkerService, ConfigService],
      useFactory: (
        service: WatchSourcePollingWorkerService,
        config: ConfigService,
      ): WatchSourcePollingWorker =>
        new WatchSourcePollingWorker(service, {
          pollIntervalMs: config.getOrThrow<number>('DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS'),
        }),
    },
    {
      provide: WatchSourceCdcWorker,
      inject: [SealCdcWindowsService, ConfigService],
      useFactory: (service: SealCdcWindowsService, config: ConfigService): WatchSourceCdcWorker =>
        new WatchSourceCdcWorker(service, {
          pollIntervalMs: config.getOrThrow<number>('DATA_WORKFLOW_CDC_SEAL_INTERVAL_MS'),
        }),
    },
    {
      provide: WatchSourceDeliveryWorkerService,
      inject: [
        WATCH_SOURCE_REPOSITORY,
        WORKFLOW_REPOSITORY,
        WORKFLOW_RUN_REPOSITORY,
        WORKFLOW_ACCESS,
        AuthenticatedContextStore,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        repository: IWatchSourceRepository,
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
        contexts: AuthenticatedContextStore,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): WatchSourceDeliveryWorkerService => {
        const workerConfig: WatchSourceDeliveryWorkerConfig = {
          claimBatchSize: config.getOrThrow<number>('DATA_WORKFLOW_CLAIM_BATCH_SIZE'),
          leaseMs: config.getOrThrow<number>('DATA_WORKFLOW_LEASE_MS'),
          reconciliationBatchSize: config.get<number>(
            'DATA_WORKFLOW_WATCH_SOURCE_RECONCILIATION_BATCH_SIZE',
            100,
          ),
        };
        return new WatchSourceDeliveryWorkerService(
          repository,
          workflows,
          runs,
          access,
          contexts,
          unitOfWork,
          clock,
          ids,
          workerConfig,
        );
      },
    },
    {
      provide: WatchSourceDeliveryWorker,
      inject: [WatchSourceDeliveryWorkerService, ConfigService],
      useFactory: (
        service: WatchSourceDeliveryWorkerService,
        config: ConfigService,
      ): WatchSourceDeliveryWorker =>
        new WatchSourceDeliveryWorker(service, {
          pollIntervalMs: config.getOrThrow<number>('DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS'),
        }),
    },
    {
      provide: WorkflowScheduleWorkerService,
      inject: [
        WORKFLOW_SCHEDULE_CLAIM_STORE,
        WORKFLOW_REPOSITORY,
        WORKFLOW_RUN_REPOSITORY,
        WORKFLOW_ACCESS,
        WORKFLOW_TRIGGER_SCHEDULE,
        AuthenticatedContextStore,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        claims: IWorkflowScheduleClaimStore,
        workflows: IWorkflowRepository,
        runs: IWorkflowRunRepository,
        access: IWorkflowAccess,
        triggers: IWorkflowTriggerSchedule,
        contexts: AuthenticatedContextStore,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): WorkflowScheduleWorkerService =>
        new WorkflowScheduleWorkerService(
          claims,
          workflows,
          runs,
          access,
          triggers,
          contexts,
          unitOfWork,
          clock,
          ids,
          {
            batchSize: config.getOrThrow<number>('DATA_WORKFLOW_CLAIM_BATCH_SIZE'),
            leaseMs: config.getOrThrow<number>('DATA_WORKFLOW_LEASE_MS'),
          },
        ),
    },
    {
      provide: WorkflowScheduleWorker,
      inject: [WorkflowScheduleWorkerService, ConfigService],
      useFactory: (
        service: WorkflowScheduleWorkerService,
        config: ConfigService,
      ): WorkflowScheduleWorker =>
        new WorkflowScheduleWorker(service, {
          pollIntervalMs: config.getOrThrow<number>('DATA_WORKFLOW_WORKER_POLL_INTERVAL_MS'),
        }),
    },
  ],
})
export class DataWorkflowWorkerModule {}
