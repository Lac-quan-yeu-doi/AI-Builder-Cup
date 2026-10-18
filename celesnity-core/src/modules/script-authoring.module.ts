import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CONNECTION_REFERENCE_PROVIDER } from '@application/database-service/tokens';
import { type IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import { PerScriptPublicationQueue } from '@application/script-authoring/per-script-publication.queue';
import { PublishedSourceReader } from '@application/script-authoring/published-source.reader';
import { ScriptAuthoringUseCases } from '@application/script-authoring/script-authoring.use-cases';
import { type ScriptAuthoringConfig } from '@application/script-authoring/script-authoring.config';
import { ScriptPublicationService } from '@application/script-authoring/script-publication.service';
import { type IScriptMetadataRepository } from '@application/script-authoring/interfaces/i-script-metadata-repository';
import { type IScriptPublicationLock } from '@application/script-authoring/interfaces/i-script-publication-lock';
import { type IScriptReader } from '@application/script-authoring/interfaces/i-script-reader';
import { type IScriptRepository } from '@application/script-authoring/interfaces/i-script-repository';
import { type IScriptVersionRepository } from '@application/script-authoring/interfaces/i-script-version-repository';
import { type ISourceArtifactStore } from '@application/script-authoring/interfaces/i-source-artifact-store';
import {
  PUBLISHED_SCRIPT_PROVIDER,
  SCRIPT_METADATA_REPOSITORY,
  SCRIPT_PUBLICATION_LOCK,
  SCRIPT_READER,
  SCRIPT_REPOSITORY,
  SCRIPT_VERSION_REPOSITORY,
  SOURCE_ARTIFACT_STORE,
} from '@application/script-authoring/tokens';
import { type IClock } from '@application/shared/interfaces/i-clock';
import { type IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { type IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '@application/shared/tokens';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { MinioClientFactory } from '@infrastructure/minio/minio-client.factory';
import { MinioSourceArtifactStore } from '@infrastructure/minio/script-authoring/minio-source-artifact.store';
import { PostgreSqlScriptPublicationLock } from '@infrastructure/postgres/script-authoring/postgresql-script-publication.lock';
import { PrismaScriptReader } from '@infrastructure/prisma/script-authoring/prisma-script.reader';
import { ScriptMapper } from '@infrastructure/prisma/script-authoring/script.mapper';
import { ScriptViewMapper } from '@infrastructure/prisma/script-authoring/script-view.mapper';
import { PrismaScriptRepository } from '@infrastructure/prisma/script-authoring/prisma-script.repository';
import { PrismaScriptVersionRepository } from '@infrastructure/prisma/script-authoring/prisma-script-version.repository';
import { ScriptAuthoringPublishedScriptAdapter } from '@infrastructure/providers/script-authoring/script-authoring-published-script.adapter';
import { RandomUuidGenerator } from '@infrastructure/system/random-uuid-generator';
import { SystemClock } from '@infrastructure/system/system-clock';

/**
 * Token for the context's deployment settings, so the two values are resolved
 * once and shared by the pieces that need them instead of each reaching for
 * `ConfigService` and re-reading the same keys.
 */
const SCRIPT_AUTHORING_CONFIG = Symbol('ScriptAuthoringConfig');

@Module({
  imports: [DatabaseServiceModule],
  providers: [
    ScriptMapper,
    ScriptViewMapper,
    PrismaScriptRepository,
    PrismaScriptVersionRepository,
    PrismaScriptReader,
    MinioClientFactory,
    MinioSourceArtifactStore,
    PostgreSqlScriptPublicationLock,
    SystemClock,
    RandomUuidGenerator,
    PerScriptPublicationQueue,
    { provide: SCRIPT_REPOSITORY, useExisting: PrismaScriptRepository },
    { provide: SCRIPT_METADATA_REPOSITORY, useExisting: PrismaScriptRepository },
    { provide: SCRIPT_VERSION_REPOSITORY, useExisting: PrismaScriptVersionRepository },
    { provide: SCRIPT_READER, useExisting: PrismaScriptReader },
    { provide: SOURCE_ARTIFACT_STORE, useExisting: MinioSourceArtifactStore },
    { provide: SCRIPT_PUBLICATION_LOCK, useExisting: PostgreSqlScriptPublicationLock },
    { provide: CLOCK, useExisting: SystemClock },
    { provide: ID_GENERATOR, useExisting: RandomUuidGenerator },
    {
      provide: SCRIPT_AUTHORING_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ScriptAuthoringConfig => ({
        artifactsBucket: config.getOrThrow<string>('MINIO_ARTIFACTS_BUCKET'),
        sourceMaxBytes: config.getOrThrow<number>('SCRIPT_SOURCE_MAX_BYTES'),
      }),
    },
    {
      provide: PublishedSourceReader,
      inject: [SOURCE_ARTIFACT_STORE, SCRIPT_AUTHORING_CONFIG],
      useFactory: (
        artifactStore: ISourceArtifactStore,
        config: ScriptAuthoringConfig,
      ): PublishedSourceReader => new PublishedSourceReader(artifactStore, config),
    },
    {
      provide: ScriptPublicationService,
      inject: [
        SCRIPT_REPOSITORY,
        SCRIPT_VERSION_REPOSITORY,
        SOURCE_ARTIFACT_STORE,
        PerScriptPublicationQueue,
        SCRIPT_PUBLICATION_LOCK,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        SCRIPT_AUTHORING_CONFIG,
      ],
      useFactory: (
        repository: IScriptRepository,
        versionRepository: IScriptVersionRepository,
        artifactStore: ISourceArtifactStore,
        publicationQueue: PerScriptPublicationQueue,
        publicationLock: IScriptPublicationLock,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        config: ScriptAuthoringConfig,
      ): ScriptPublicationService =>
        new ScriptPublicationService(
          repository,
          versionRepository,
          artifactStore,
          publicationQueue,
          publicationLock,
          unitOfWork,
          clock,
          idGenerator,
          config,
        ),
    },
    {
      provide: ScriptAuthoringUseCases,
      inject: [
        SCRIPT_REPOSITORY,
        SCRIPT_METADATA_REPOSITORY,
        SCRIPT_READER,
        CONNECTION_REFERENCE_PROVIDER,
        ScriptPublicationService,
        PublishedSourceReader,
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        SCRIPT_AUTHORING_CONFIG,
      ],
      useFactory: (
        repository: IScriptRepository,
        metadataRepository: IScriptMetadataRepository,
        reader: IScriptReader,
        connectionReferences: IConnectionReferenceProvider,
        publication: ScriptPublicationService,
        publishedSource: PublishedSourceReader,
        unitOfWork: IUnitOfWork,
        clock: IClock,
        idGenerator: IIdGenerator,
        config: ScriptAuthoringConfig,
      ): ScriptAuthoringUseCases =>
        new ScriptAuthoringUseCases(
          repository,
          metadataRepository,
          reader,
          connectionReferences,
          publication,
          publishedSource,
          unitOfWork,
          clock,
          idGenerator,
          config,
        ),
    },
    // The cross-context port resolves to a thin adapter, so the use case does not
    // have to implement an interface owned by its consumers.
    ScriptAuthoringPublishedScriptAdapter,
    { provide: PUBLISHED_SCRIPT_PROVIDER, useExisting: ScriptAuthoringPublishedScriptAdapter },
  ],
  exports: [PUBLISHED_SCRIPT_PROVIDER],
})
export class ScriptAuthoringModule {}
