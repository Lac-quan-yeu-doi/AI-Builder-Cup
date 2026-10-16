import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CatalogController } from '@presentation/catalog-exploration/catalog.controller';
import { TrinoCatalogReader } from '@infrastructure/trino/catalog-exploration/trino-catalog.reader';
import { TrinoCatalogWriter } from '@infrastructure/trino/catalog-exploration/trino-catalog.writer';
import { InMemoryColumnProfileStore } from '@infrastructure/memory/catalog-exploration/in-memory-column-profile.store';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import {
  CATALOG_NAMESPACE_METADATA,
  CATALOG_PROFILE_CACHE,
  CATALOG_READER,
  CATALOG_WRITER,
} from '@application/catalog-exploration/tokens';
import { type ICatalogReader } from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import { AdministrationModule } from '@modules/administration.module';
import { AdministrationUseCases } from '@application/administration/administration.use-cases';
import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import { PrismaCatalogNamespaceMetadataRepository } from '@infrastructure/prisma/catalog-exploration/prisma-catalog-namespace-metadata.repository';

/**
 * Composition root for the Catalog Exploration context.
 *
 * API-only: it wires the Trino anti-corruption layer and the organization-scoped
 * namespace-description repository to the HTTP controller. There is no worker
 * and Trino/Iceberg remains authoritative for physical catalog resources.
 */
@Module({
  imports: [AdministrationModule],
  controllers: [CatalogController],
  providers: [
    TrinoCatalogReader,
    TrinoCatalogWriter,
    PrismaCatalogNamespaceMetadataRepository,
    InMemoryColumnProfileStore,
    { provide: CATALOG_READER, useExisting: TrinoCatalogReader },
    { provide: CATALOG_WRITER, useExisting: TrinoCatalogWriter },
    {
      provide: CATALOG_NAMESPACE_METADATA,
      useExisting: PrismaCatalogNamespaceMetadataRepository,
    },
    { provide: CATALOG_PROFILE_CACHE, useExisting: InMemoryColumnProfileStore },
    {
      provide: CatalogExplorationUseCases,
      inject: [
        CATALOG_READER,
        CATALOG_WRITER,
        ConfigService,
        AdministrationUseCases,
        CATALOG_NAMESPACE_METADATA,
        CATALOG_PROFILE_CACHE,
      ],
      useFactory: (
        reader: ICatalogReader,
        writer: ICatalogWriter,
        config: ConfigService,
        authorizer: AdministrationUseCases,
        namespaceMetadata: ICatalogNamespaceMetadataRepository,
        columnProfileCache: IColumnProfileCache,
      ): CatalogExplorationUseCases =>
        new CatalogExplorationUseCases(
          reader,
          writer,
          config.getOrThrow<string>('TRINO_CATALOG'),
          config.getOrThrow<number>('CATALOG_PREVIEW_MAX_ROWS'),
          authorizer,
          namespaceMetadata,
          columnProfileCache,
        ),
    },
  ],
  // CATALOG_PROFILE_CACHE is exported too, not just CatalogExplorationUseCases:
  // QueryWorkbenchModule imports this module so its own submit() can read the
  // same cached profiles (Requirement: 01, "grounding via summarized stats")
  // to power value-suggestion warnings — sharing the cache instance, not a
  // second one, is what makes "already profiled this session" mean the same
  // thing in both places.
  exports: [CatalogExplorationUseCases, CATALOG_READER, CATALOG_PROFILE_CACHE],
})
export class CatalogExplorationModule {}
