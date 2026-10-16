import { Module } from '@nestjs/common';

import {
  DATABASE_METADATA_SOURCE_REGISTRY,
  METADATA_CRAWLER_LOG_STORE,
  METADATA_CRAWLER_READER,
  METADATA_CRAWLER_REPOSITORY,
  METADATA_CRAWLER_RUN_QUEUE,
  METADATA_CRAWLER_RUN_REPOSITORY,
  METADATA_CRAWLER_SCHEDULE,
  METADATA_CRAWLER_SCHEDULER_STORE,
  SOURCE_METADATA_CATALOG_READER,
} from '@application/metadata-crawler/tokens';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { DatabaseModule } from '@modules/database.module';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlMetadataSourceFactory } from '@infrastructure/dbms/mysql/mysql-metadata.source';
import { DatabaseMetadataSourceRegistry } from '@infrastructure/dbms/registry/database-metadata-source.registry';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresMetadataSourceFactory } from '@infrastructure/dbms/postgresql/postgres-metadata.source';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioMetadataCrawlerLogStore } from '@infrastructure/minio/metadata-crawler/minio-metadata-crawler-log.store';
import { PrismaMetadataCatalogWriter } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-catalog.writer';
import { MetadataCrawlerMapper } from '@infrastructure/prisma/metadata-crawler/metadata-crawler.mapper';
import { PrismaMetadataCrawlerReader } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler.reader';
import { PrismaMetadataCrawlerRepository } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler.repository';
import { PrismaMetadataCrawlerRunQueue } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler-run.queue';
import { PrismaMetadataCrawlerRunRepository } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler-run.repository';
import { PrismaMetadataCrawlerSchedulerStore } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-crawler-scheduler.store';
import { PrismaSourceMetadataCatalogReader } from '@infrastructure/prisma/metadata-crawler/prisma-source-metadata-catalog.reader';
import { CronMetadataCrawlerSchedule } from '@infrastructure/scheduling/cron-metadata-crawler-schedule';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { PrismaService } from '@infrastructure/prisma/prisma.service';

/** Shared persistence and connector composition for the API and crawler worker. */
@Module({
  imports: [DatabaseModule, DatabaseServiceModule],
  providers: [
    MetadataCrawlerMapper,
    PrismaMetadataCrawlerRepository,
    PrismaMetadataCrawlerReader,
    PrismaMetadataCrawlerRunRepository,
    PrismaSourceMetadataCatalogReader,
    MinioClientFactory,
    MinioMetadataCrawlerLogStore,
    SystemClock,
    RandomUuidGenerator,
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: METADATA_CRAWLER_SCHEDULE,
      useFactory: (): CronMetadataCrawlerSchedule => new CronMetadataCrawlerSchedule(),
    },
    {
      provide: METADATA_CRAWLER_RUN_QUEUE,
      inject: [PrismaService, MetadataCrawlerMapper, ID_GENERATOR],
      useFactory: (
        prisma: PrismaService,
        mapper: MetadataCrawlerMapper,
        ids: IIdGenerator,
      ): PrismaMetadataCrawlerRunQueue => new PrismaMetadataCrawlerRunQueue(prisma, mapper, ids),
    },
    {
      provide: METADATA_CRAWLER_SCHEDULER_STORE,
      inject: [PrismaService, MetadataCrawlerMapper, METADATA_CRAWLER_SCHEDULE, ID_GENERATOR],
      useFactory: (
        prisma: PrismaService,
        mapper: MetadataCrawlerMapper,
        schedule: CronMetadataCrawlerSchedule,
        ids: IIdGenerator,
      ): PrismaMetadataCrawlerSchedulerStore =>
        new PrismaMetadataCrawlerSchedulerStore(prisma, mapper, schedule, ids),
    },
    {
      provide: PrismaMetadataCatalogWriter,
      inject: [PrismaService, ID_GENERATOR],
      useFactory: (prisma: PrismaService, ids: IIdGenerator): PrismaMetadataCatalogWriter =>
        new PrismaMetadataCatalogWriter(prisma, ids),
    },
    {
      provide: DATABASE_METADATA_SOURCE_REGISTRY,
      inject: [PostgresConfigCodec, MysqlConfigCodec],
      useFactory: (
        postgresCodec: PostgresConfigCodec,
        mysqlCodec: MysqlConfigCodec,
      ): DatabaseMetadataSourceRegistry =>
        new DatabaseMetadataSourceRegistry([
          new PostgresMetadataSourceFactory(postgresCodec),
          new MysqlMetadataSourceFactory(mysqlCodec),
        ]),
    },
    { provide: METADATA_CRAWLER_REPOSITORY, useExisting: PrismaMetadataCrawlerRepository },
    { provide: METADATA_CRAWLER_READER, useExisting: PrismaMetadataCrawlerReader },
    { provide: METADATA_CRAWLER_RUN_REPOSITORY, useExisting: PrismaMetadataCrawlerRunRepository },
    { provide: METADATA_CRAWLER_LOG_STORE, useExisting: MinioMetadataCrawlerLogStore },
    { provide: SOURCE_METADATA_CATALOG_READER, useExisting: PrismaSourceMetadataCatalogReader },
  ],
  exports: [
    DatabaseServiceModule,
    DATABASE_METADATA_SOURCE_REGISTRY,
    METADATA_CRAWLER_REPOSITORY,
    METADATA_CRAWLER_READER,
    METADATA_CRAWLER_RUN_QUEUE,
    METADATA_CRAWLER_RUN_REPOSITORY,
    METADATA_CRAWLER_SCHEDULER_STORE,
    METADATA_CRAWLER_SCHEDULE,
    METADATA_CRAWLER_LOG_STORE,
    SOURCE_METADATA_CATALOG_READER,
    PrismaMetadataCatalogWriter,
    CLOCK,
    ID_GENERATOR,
  ],
})
export class MetadataCrawlerInfrastructureModule {}
