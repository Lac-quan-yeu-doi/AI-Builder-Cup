import { Module } from '@nestjs/common';

import type { IPipelineNodePreviewer } from '@application/pipeline-authoring/interfaces/i-pipeline-node-previewer';
import type { IPipelineRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type { IPipelineSourceMembershipReader } from '@application/pipeline-authoring/interfaces/i-pipeline-source-membership-reader';
import { PipelineAuthoringUseCases } from '@application/pipeline-authoring/pipeline-authoring.use-cases';
import { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import {
  PIPELINE_NODE_PREVIEWER,
  PIPELINE_REPOSITORY,
  PIPELINE_SOURCE_MEMBERSHIP_READER,
  PIPELINE_VERSION_REPOSITORY,
} from '@application/pipeline-authoring/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { PrismaPipelineRepository } from '@infrastructure/prisma/pipeline-authoring/prisma-pipeline.repository';
import { PrismaPipelineVersionRepository } from '@infrastructure/prisma/pipeline-authoring/prisma-pipeline-version.repository';
import { PipelineNodePreviewer } from '@infrastructure/pipeline-authoring/pipeline-node.previewer';
import { PrismaPipelineSourceMembershipReader } from '@infrastructure/prisma/pipeline-authoring/prisma-pipeline-source-membership.reader';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { NodeCatalogModule } from '@modules/node-catalog.module';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { PipelineController } from '@presentation/pipeline-authoring/pipeline.controller';

@Module({
  imports: [NodeCatalogModule, CatalogExplorationModule, DatabaseServiceModule],
  controllers: [PipelineController],
  providers: [
    PrismaPipelineRepository,
    PrismaPipelineVersionRepository,
    PrismaPipelineSourceMembershipReader,
    PipelineNodePreviewer,
    SystemClock,
    RandomUuidGenerator,
    {
      provide: PipelineGraphValidator,
      inject: [NodeCatalogUseCases],
      useFactory: (nodeCatalog: NodeCatalogUseCases): PipelineGraphValidator =>
        new PipelineGraphValidator(nodeCatalog),
    },
    { provide: PIPELINE_REPOSITORY, useExisting: PrismaPipelineRepository },
    { provide: PIPELINE_VERSION_REPOSITORY, useExisting: PrismaPipelineVersionRepository },
    { provide: PIPELINE_NODE_PREVIEWER, useExisting: PipelineNodePreviewer },
    {
      provide: PIPELINE_SOURCE_MEMBERSHIP_READER,
      useExisting: PrismaPipelineSourceMembershipReader,
    },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: PipelineAuthoringUseCases,
      inject: [
        PIPELINE_REPOSITORY,
        PIPELINE_VERSION_REPOSITORY,
        PipelineGraphValidator,
        PIPELINE_NODE_PREVIEWER,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        PIPELINE_SOURCE_MEMBERSHIP_READER,
      ],
      useFactory: (
        repository: IPipelineRepository,
        versions: IPipelineVersionRepository,
        validator: PipelineGraphValidator,
        previewer: IPipelineNodePreviewer,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        ids: IIdGenerator,
        sourceMemberships: IPipelineSourceMembershipReader,
      ): PipelineAuthoringUseCases =>
        new PipelineAuthoringUseCases(
          repository,
          versions,
          validator,
          previewer,
          unitOfWork,
          clock,
          ids,
          sourceMemberships,
        ),
    },
  ],
  exports: [PIPELINE_REPOSITORY, PIPELINE_VERSION_REPOSITORY],
})
export class PipelineAuthoringModule {}
