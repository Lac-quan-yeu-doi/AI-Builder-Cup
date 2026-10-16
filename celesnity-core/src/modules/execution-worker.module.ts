import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CONNECTION_EXECUTION_PROFILE_PROVIDER } from '@application/database-service/tokens';
import { type IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import { ExecutionWorkerService } from '@application/execution-orchestration/execution-worker.service';
import { ExecutableWorkloadProvider } from '@application/execution-orchestration/executable-workload.provider';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import { type IExecutionDispatcher } from '@application/execution-orchestration/interfaces/i-execution-dispatcher';
import { type IExecutionLogStore } from '@application/execution-orchestration/interfaces/i-execution-log-store';
import { type IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import { type ISparkExecutionGateway } from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import { SparkSubmissionSupervisor } from '@application/execution-orchestration/spark-submission.supervisor';
import {
  EXECUTION_DISPATCHER,
  EXECUTION_LOG_STORE,
  EXECUTION_REPOSITORY,
  EXECUTABLE_WORKLOAD_PROVIDER,
  SPARK_EXECUTION_GATEWAY,
} from '@application/execution-orchestration/tokens';
import { COMPILED_PIPELINE_PROVIDER } from '@application/pipeline-compilation/tokens';
import type { ICompiledPipelineProvider } from '@application/pipeline-compilation/interfaces/i-compiled-pipeline-provider';
import { PUBLISHED_SCRIPT_PROVIDER } from '@application/script-authoring/tokens';
import { type IPublishedScriptProvider } from '@application/script-authoring/interfaces/i-published-script-provider';
import { type IClock } from '@application/shared/interfaces/i-clock';
import { type IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { type IIntegrationEventPublisher } from '@application/shared/interfaces/i-integration-event-publisher';
import { type IOutboxStore } from '@application/shared/interfaces/i-outbox-store';
import { type IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { OutboxRelayService } from '@application/shared/outbox-relay.service';
import {
  CLOCK,
  ID_GENERATOR,
  INTEGRATION_EVENT_PUBLISHER,
  OUTBOX_STORE,
  UNIT_OF_WORK,
} from '@application/shared/tokens';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { ScriptAuthoringModule } from '@modules/script-authoring.module';
import { PipelineCompilationModule } from '@modules/pipeline-compilation.module';
import { LoggingIntegrationEventPublisher } from '@infrastructure/messaging/logging-integration-event.publisher';
import { RedpandaIntegrationEventPublisher } from '@infrastructure/messaging/redpanda-integration-event.publisher';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioExecutionLogStore } from '@infrastructure/minio/execution-orchestration/minio-execution-log.store';
import { ExecutionMapper } from '@infrastructure/prisma/execution-orchestration/execution.mapper';
import { PrismaExecutionDispatcher } from '@infrastructure/prisma/execution-orchestration/prisma-execution.dispatcher';
import { PrismaExecutionRepository } from '@infrastructure/prisma/execution-orchestration/prisma-execution.repository';
import { PrismaOutboxStore } from '@infrastructure/prisma/messaging/prisma-outbox.store';
import { DockerSparkExecutionGateway } from '@infrastructure/spark/execution-orchestration/docker-spark-execution.gateway';
import { KubernetesSparkExecutionGateway } from '@infrastructure/spark/execution-orchestration/kubernetes-spark-execution.gateway';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { ExecutionWorker } from '@infrastructure/worker/execution-orchestration/execution-worker';
import { OutboxRelayWorker } from '@infrastructure/worker/messaging/outbox-relay.worker';
import { AuthenticatedContextStore } from '@application/administration/authenticated-context';

/**
 * The worker process: the execution claim loop and the outbox relay.
 *
 * The relay lives here rather than in the API process because delivery is
 * background work. Running it beside the request path would put every API replica
 * in contention for the same rows and couple delivery latency to request load.
 */
@Module({
  imports: [ScriptAuthoringModule, PipelineCompilationModule, DatabaseServiceModule],
  providers: [
    ExecutionMapper,
    PrismaExecutionRepository,
    PrismaExecutionDispatcher,
    PrismaOutboxStore,
    LoggingIntegrationEventPublisher,
    RedpandaIntegrationEventPublisher,
    MinioClientFactory,
    MinioExecutionLogStore,
    SystemClock,
    RandomUuidGenerator,
    { provide: EXECUTION_REPOSITORY, useExisting: PrismaExecutionRepository },
    { provide: EXECUTION_DISPATCHER, useExisting: PrismaExecutionDispatcher },
    {
      provide: SPARK_EXECUTION_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ISparkExecutionGateway =>
        config.getOrThrow<string>('SPARK_EXECUTION_BACKEND') === 'kubernetes'
          ? new KubernetesSparkExecutionGateway(config)
          : new DockerSparkExecutionGateway(config),
    },
    { provide: EXECUTION_LOG_STORE, useExisting: MinioExecutionLogStore },
    { provide: OUTBOX_STORE, useExisting: PrismaOutboxStore },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: EXECUTABLE_WORKLOAD_PROVIDER,
      inject: [PUBLISHED_SCRIPT_PROVIDER, COMPILED_PIPELINE_PROVIDER],
      useFactory: (
        scripts: IPublishedScriptProvider,
        pipelines: ICompiledPipelineProvider,
      ): IExecutableWorkloadProvider => new ExecutableWorkloadProvider(scripts, pipelines),
    },
    {
      provide: INTEGRATION_EVENT_PUBLISHER,
      inject: [ConfigService, LoggingIntegrationEventPublisher, RedpandaIntegrationEventPublisher],
      useFactory: (
        config: ConfigService,
        logging: LoggingIntegrationEventPublisher,
        redpanda: RedpandaIntegrationEventPublisher,
      ): IIntegrationEventPublisher =>
        config.getOrThrow<string>('INTEGRATION_EVENT_PUBLISHER_BACKEND') === 'redpanda'
          ? redpanda
          : logging,
    },
    {
      provide: SparkSubmissionSupervisor,
      inject: [SPARK_EXECUTION_GATEWAY, EXECUTION_LOG_STORE, ConfigService],
      useFactory: (
        gateway: ISparkExecutionGateway,
        logStore: IExecutionLogStore,
        config: ConfigService,
      ): SparkSubmissionSupervisor =>
        new SparkSubmissionSupervisor(
          gateway,
          logStore,
          {
            timeoutMs: config.getOrThrow<number>('EXECUTION_TIMEOUT_MS'),
            pollIntervalMs: config.getOrThrow<number>('EXECUTION_POLL_INTERVAL_MS'),
          },
          new Logger(SparkSubmissionSupervisor.name),
        ),
    },
    {
      provide: ExecutionWorkerService,
      inject: [
        EXECUTION_REPOSITORY,
        EXECUTION_DISPATCHER,
        SPARK_EXECUTION_GATEWAY,
        SparkSubmissionSupervisor,
        EXECUTABLE_WORKLOAD_PROVIDER,
        CONNECTION_EXECUTION_PROFILE_PROVIDER,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        AuthenticatedContextStore,
        ConfigService,
      ],
      useFactory: (
        repository: IExecutionRepository,
        dispatcher: IExecutionDispatcher,
        gateway: ISparkExecutionGateway,
        submissions: SparkSubmissionSupervisor,
        workloads: IExecutableWorkloadProvider,
        connectionProfiles: IConnectionExecutionProfileProvider,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        contexts: AuthenticatedContextStore,
        config: ConfigService,
      ): ExecutionWorkerService =>
        new ExecutionWorkerService(
          repository,
          dispatcher,
          gateway,
          submissions,
          workloads,
          connectionProfiles,
          unitOfWork,
          clock,
          idGenerator,
          contexts,
          {
            maxAttempts: config.getOrThrow<number>('EXECUTION_MAX_ATTEMPTS'),
            artifactsBucket: config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET'),
          },
          new Logger(ExecutionWorkerService.name),
        ),
    },
    {
      provide: ExecutionWorker,
      inject: [ExecutionWorkerService, ConfigService],
      useFactory: (service: ExecutionWorkerService, config: ConfigService): ExecutionWorker =>
        new ExecutionWorker(
          service,
          config.getOrThrow<number>('EXECUTION_CLAIM_BATCH_SIZE'),
          config.getOrThrow<number>('EXECUTION_POLL_INTERVAL_MS'),
        ),
    },
    {
      provide: OutboxRelayService,
      inject: [OUTBOX_STORE, INTEGRATION_EVENT_PUBLISHER, CLOCK, ConfigService],
      useFactory: (
        store: IOutboxStore,
        publisher: IIntegrationEventPublisher,
        clock: IClock,
        config: ConfigService,
      ): OutboxRelayService =>
        new OutboxRelayService(
          store,
          publisher,
          clock,
          {
            batchSize: config.getOrThrow<number>('OUTBOX_RELAY_BATCH_SIZE'),
            maxAttempts: config.getOrThrow<number>('OUTBOX_RELAY_MAX_ATTEMPTS'),
            baseBackoffMs: config.getOrThrow<number>('OUTBOX_RELAY_BASE_BACKOFF_MS'),
            maxBackoffMs: config.getOrThrow<number>('OUTBOX_RELAY_MAX_BACKOFF_MS'),
            claimTimeoutMs: config.getOrThrow<number>('OUTBOX_RELAY_CLAIM_TIMEOUT_MS'),
            retentionMs: config.getOrThrow<number>('OUTBOX_RETENTION_MS'),
          },
          new Logger(OutboxRelayService.name),
        ),
    },
    {
      provide: OutboxRelayWorker,
      inject: [OutboxRelayService, ConfigService],
      useFactory: (relay: OutboxRelayService, config: ConfigService): OutboxRelayWorker =>
        new OutboxRelayWorker(relay, {
          pollIntervalMs: config.getOrThrow<number>('OUTBOX_RELAY_POLL_INTERVAL_MS'),
          maintenanceIntervalMs: config.getOrThrow<number>('OUTBOX_RELAY_MAINTENANCE_INTERVAL_MS'),
          maxConsecutiveDrains: config.getOrThrow<number>('OUTBOX_RELAY_MAX_CONSECUTIVE_DRAINS'),
        }),
    },
  ],
})
export class ExecutionWorkerModule {}
