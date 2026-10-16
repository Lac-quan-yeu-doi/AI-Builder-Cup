import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DATABASE_SERVICE_RUNTIME_PROVIDER } from '@application/database-service/tokens';
import type { IDatabaseServiceRuntimeProvider } from '@application/database-service/interfaces/i-database-service-runtime-provider';
import { DatabaseMetadataCrawler } from '@application/metadata-crawler/database-metadata-crawler';
import { MetadataCrawlerSchedulerService } from '@application/metadata-crawler/metadata-crawler-scheduler.service';
import {
  MetadataCrawlerWorkerService,
  type MetadataCrawlerWorkerConfig,
} from '@application/metadata-crawler/metadata-crawler-worker.service';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type { IMetadataCatalogWriter } from '@application/metadata-crawler/interfaces/i-metadata-catalog-writer';
import type { IMetadataCrawlerLogStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { IMetadataCrawlerRunRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-repository';
import type { IMetadataCrawlerSchedulerStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-scheduler-store';
import {
  DATABASE_METADATA_SOURCE_REGISTRY,
  METADATA_CRAWLER_LOG_STORE,
  METADATA_CRAWLER_REPOSITORY,
  METADATA_CRAWLER_RUN_QUEUE,
  METADATA_CRAWLER_RUN_REPOSITORY,
  METADATA_CRAWLER_SCHEDULER_STORE,
  METADATA_CRAWLER_TELEMETRY,
} from '@application/metadata-crawler/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { MetadataCrawlerInfrastructureModule } from '@modules/metadata-crawler-infrastructure.module';
import { LoggingMetadataCrawlerTelemetry } from '@infrastructure/telemetry/metadata-crawler/logging-metadata-crawler.telemetry';
import { MetadataCrawlerSchedulerWorker } from '@infrastructure/worker/metadata-crawler/metadata-crawler-scheduler.worker';
import { MetadataCrawlerRecoveryWorker } from '@infrastructure/worker/metadata-crawler/metadata-crawler-recovery.worker';
import { RedpandaMetadataCrawlerConsumer } from '@infrastructure/messaging/metadata-crawler/redpanda-metadata-crawler.consumer';
import { PrismaMetadataCatalogWriter } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-catalog.writer';

/** Background-only composition. It intentionally does not import API controllers. */
@Module({
  imports: [MetadataCrawlerInfrastructureModule],
  providers: [
    {
      provide: DatabaseMetadataCrawler,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DatabaseMetadataCrawler =>
        new DatabaseMetadataCrawler(
          config.getOrThrow<number>('METADATA_CRAWLER_RELATION_CONCURRENCY'),
        ),
    },
    LoggingMetadataCrawlerTelemetry,
    RedpandaMetadataCrawlerConsumer,
    {
      provide: MetadataCrawlerRecoveryWorker,
      inject: [METADATA_CRAWLER_RUN_QUEUE, UNIT_OF_WORK, CLOCK, ID_GENERATOR, ConfigService],
      useFactory: (
        queue: IMetadataCrawlerRunQueue,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): MetadataCrawlerRecoveryWorker =>
        new MetadataCrawlerRecoveryWorker(queue, unitOfWork, clock, ids, {
          maxAttempts: config.getOrThrow<number>('METADATA_CRAWLER_MAX_ATTEMPTS'),
          intervalMs: config.getOrThrow<number>('METADATA_CRAWLER_RECOVERY_INTERVAL_MS'),
        }),
    },
    { provide: METADATA_CRAWLER_TELEMETRY, useExisting: LoggingMetadataCrawlerTelemetry },
    {
      provide: MetadataCrawlerSchedulerService,
      inject: [METADATA_CRAWLER_SCHEDULER_STORE, CLOCK, ConfigService, UNIT_OF_WORK, ID_GENERATOR],
      useFactory: (
        store: IMetadataCrawlerSchedulerStore,
        clock: IClock,
        config: ConfigService,
        unitOfWork: IUnitOfWork,
        ids: IIdGenerator,
      ): MetadataCrawlerSchedulerService =>
        new MetadataCrawlerSchedulerService(
          store,
          clock,
          config.getOrThrow<number>('METADATA_CRAWLER_CLAIM_BATCH_SIZE'),
          unitOfWork,
          ids,
        ),
    },
    {
      provide: MetadataCrawlerSchedulerWorker,
      inject: [MetadataCrawlerSchedulerService, ConfigService],
      useFactory: (
        scheduler: MetadataCrawlerSchedulerService,
        config: ConfigService,
      ): MetadataCrawlerSchedulerWorker =>
        new MetadataCrawlerSchedulerWorker(scheduler, {
          pollIntervalMs: config.getOrThrow<number>('METADATA_CRAWLER_SCHEDULE_INTERVAL_MS'),
        }),
    },
    {
      provide: MetadataCrawlerWorkerService,
      inject: [
        METADATA_CRAWLER_RUN_QUEUE,
        METADATA_CRAWLER_RUN_REPOSITORY,
        METADATA_CRAWLER_REPOSITORY,
        DATABASE_SERVICE_RUNTIME_PROVIDER,
        DATABASE_METADATA_SOURCE_REGISTRY,
        METADATA_CRAWLER_TELEMETRY,
        METADATA_CRAWLER_LOG_STORE,
        PrismaMetadataCatalogWriter,
        DatabaseMetadataCrawler,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        queue: IMetadataCrawlerRunQueue,
        runRepository: IMetadataCrawlerRunRepository,
        crawlerRepository: IMetadataCrawlerRepository,
        runtimeProvider: IDatabaseServiceRuntimeProvider,
        sourceRegistry: IDatabaseMetadataSourceRegistry,
        telemetry: LoggingMetadataCrawlerTelemetry,
        logStore: IMetadataCrawlerLogStore,
        catalogWriter: IMetadataCatalogWriter,
        crawler: DatabaseMetadataCrawler,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): MetadataCrawlerWorkerService => {
        const workerConfig: MetadataCrawlerWorkerConfig = {
          claimBatchSize: config.getOrThrow<number>('METADATA_CRAWLER_CLAIM_BATCH_SIZE'),
          leaseMs: config.getOrThrow<number>('METADATA_CRAWLER_LEASE_MS'),
          heartbeatMs: config.getOrThrow<number>('METADATA_CRAWLER_HEARTBEAT_MS'),
        };
        return new MetadataCrawlerWorkerService(
          queue,
          runRepository,
          crawlerRepository,
          runtimeProvider,
          sourceRegistry,
          telemetry,
          logStore,
          catalogWriter,
          crawler,
          clock,
          ids,
          workerConfig,
        );
      },
    },
    // Keep a named logger provider available to deployments that want to
    // override the bounded-context logger without changing the worker API.
    Logger,
  ],
  exports: [
    MetadataCrawlerSchedulerWorker,
    MetadataCrawlerRecoveryWorker,
    MetadataCrawlerWorkerService,
  ],
})
export class MetadataCrawlerWorkerModule {}
