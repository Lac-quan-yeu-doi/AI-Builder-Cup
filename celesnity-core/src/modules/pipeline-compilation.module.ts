import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import type { IPipelineRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-repository';
import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import {
  PIPELINE_REPOSITORY,
  PIPELINE_VERSION_REPOSITORY,
} from '@application/pipeline-authoring/tokens';
import type { IPipelineCompiledArtifactRepository } from '@application/pipeline-compilation/interfaces/i-pipeline-compiled-artifact-repository';
import { PipelineCompilationService } from '@application/pipeline-compilation/pipeline-compilation.service';
import { PipelineCompiler } from '@application/pipeline-compilation/pipeline-compiler';
import {
  COMPILED_PIPELINE_PROVIDER,
  PIPELINE_COMPILED_ARTIFACT_REPOSITORY,
} from '@application/pipeline-compilation/tokens';
import type { ISourceArtifactStore } from '@application/script-authoring/interfaces/i-source-artifact-store';
import { SOURCE_ARTIFACT_STORE } from '@application/script-authoring/tokens';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { CLOCK, ID_GENERATOR } from '@application/shared/tokens';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioSourceArtifactStore } from '@infrastructure/minio/script-authoring/minio-source-artifact.store';
import { PrismaPipelineCompiledArtifactRepository } from '@infrastructure/prisma/pipeline-compilation/prisma-pipeline-compiled-artifact.repository';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';
import { NodeCatalogModule } from '@modules/node-catalog.module';
import { PipelineAuthoringModule } from '@modules/pipeline-authoring.module';
import { PipelineCompilationController } from '@presentation/pipeline-compilation/pipeline-compilation.controller';

@Module({
  imports: [PipelineAuthoringModule, NodeCatalogModule],
  controllers: [PipelineCompilationController],
  providers: [
    PrismaPipelineCompiledArtifactRepository,
    MinioClientFactory,
    MinioSourceArtifactStore,
    PipelineCompiler,
    SystemClock,
    RandomUuidGenerator,
    {
      provide: PIPELINE_COMPILED_ARTIFACT_REPOSITORY,
      useExisting: PrismaPipelineCompiledArtifactRepository,
    },
    { provide: SOURCE_ARTIFACT_STORE, useExisting: MinioSourceArtifactStore },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: PipelineCompilationService,
      inject: [
        PIPELINE_REPOSITORY,
        PIPELINE_VERSION_REPOSITORY,
        PIPELINE_COMPILED_ARTIFACT_REPOSITORY,
        SOURCE_ARTIFACT_STORE,
        NodeCatalogUseCases,
        PipelineCompiler,
        CLOCK,
        ID_GENERATOR,
        ConfigService,
      ],
      useFactory: (
        pipelines: IPipelineRepository,
        versions: IPipelineVersionRepository,
        artifacts: IPipelineCompiledArtifactRepository,
        artifactStore: ISourceArtifactStore,
        nodeCatalog: NodeCatalogUseCases,
        compiler: PipelineCompiler,
        clock: IClock,
        ids: IIdGenerator,
        config: ConfigService,
      ): PipelineCompilationService =>
        new PipelineCompilationService(
          pipelines,
          versions,
          artifacts,
          artifactStore,
          nodeCatalog,
          compiler,
          clock,
          ids,
          config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET'),
          config.getOrThrow<number>('SCRIPT_SOURCE_MAX_BYTES'),
        ),
    },
    { provide: COMPILED_PIPELINE_PROVIDER, useExisting: PipelineCompilationService },
  ],
  exports: [COMPILED_PIPELINE_PROVIDER, PipelineCompilationService],
})
export class PipelineCompilationModule {}
