import { Module } from '@nestjs/common';

import { DATABASE_SERVICE_READER } from '@application/database-service/tokens';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import { MetadataCrawlerUseCases } from '@application/metadata-crawler/metadata-crawler.use-cases';
import type { IDatabaseMetadataSourceRegistry } from '@application/metadata-crawler/interfaces/i-database-metadata-source-registry';
import type { IMetadataCrawlerLogStore } from '@application/metadata-crawler/interfaces/i-metadata-crawler-log-store';
import type { IMetadataCrawlerReader } from '@application/metadata-crawler/interfaces/i-metadata-crawler-reader';
import type { IMetadataCrawlerRepository } from '@application/metadata-crawler/interfaces/i-metadata-crawler-repository';
import type { IMetadataCrawlerRunQueue } from '@application/metadata-crawler/interfaces/i-metadata-crawler-run-queue';
import type { IMetadataCrawlerSchedule } from '@application/metadata-crawler/interfaces/i-metadata-crawler-schedule';
import type { ISourceMetadataCatalogReader } from '@application/metadata-crawler/interfaces/i-source-metadata-catalog-reader';
import { SourceMetadataQueryUseCases } from '@application/metadata-crawler/source-metadata-query.use-cases';
import {
  DATABASE_METADATA_SOURCE_REGISTRY,
  METADATA_CRAWLER_LOG_STORE,
  METADATA_CRAWLER_READER,
  METADATA_CRAWLER_REPOSITORY,
  METADATA_CRAWLER_RUN_QUEUE,
  METADATA_CRAWLER_SCHEDULE,
  SOURCE_METADATA_CATALOG_READER,
} from '@application/metadata-crawler/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { MetadataCrawlerController } from '@presentation/metadata-crawler/metadata-crawler.controller';
import { SourceMetadataController } from '@presentation/metadata-crawler/source-metadata.controller';
import { MetadataCrawlerInfrastructureModule } from '@modules/metadata-crawler-infrastructure.module';

@Module({
  imports: [MetadataCrawlerInfrastructureModule],
  controllers: [MetadataCrawlerController, SourceMetadataController],
  providers: [
    {
      provide: MetadataCrawlerUseCases,
      inject: [
        METADATA_CRAWLER_REPOSITORY,
        METADATA_CRAWLER_READER,
        METADATA_CRAWLER_RUN_QUEUE,
        DATABASE_SERVICE_READER,
        DATABASE_METADATA_SOURCE_REGISTRY,
        METADATA_CRAWLER_SCHEDULE,
        CLOCK,
        ID_GENERATOR,
        METADATA_CRAWLER_LOG_STORE,
        SOURCE_METADATA_CATALOG_READER,
        UNIT_OF_WORK,
      ],
      useFactory: (
        repository: IMetadataCrawlerRepository,
        reader: IMetadataCrawlerReader,
        queue: IMetadataCrawlerRunQueue,
        databaseReader: IDatabaseServiceReader,
        sourceRegistry: IDatabaseMetadataSourceRegistry,
        schedule: IMetadataCrawlerSchedule,
        clock: IClock,
        ids: IIdGenerator,
        logStore: IMetadataCrawlerLogStore,
        sourceMetadataReader: ISourceMetadataCatalogReader,
        unitOfWork: IUnitOfWork,
      ): MetadataCrawlerUseCases =>
        new MetadataCrawlerUseCases(
          repository,
          reader,
          queue,
          databaseReader,
          sourceRegistry,
          schedule,
          clock,
          ids,
          logStore,
          sourceMetadataReader,
          unitOfWork,
        ),
    },
    {
      provide: SourceMetadataQueryUseCases,
      inject: [METADATA_CRAWLER_READER, SOURCE_METADATA_CATALOG_READER],
      useFactory: (
        reader: IMetadataCrawlerReader,
        sourceMetadataReader: ISourceMetadataCatalogReader,
      ): SourceMetadataQueryUseCases =>
        new SourceMetadataQueryUseCases(reader, sourceMetadataReader),
    },
  ],
  exports: [MetadataCrawlerUseCases, SourceMetadataQueryUseCases],
})
export class MetadataCrawlerModule {}
