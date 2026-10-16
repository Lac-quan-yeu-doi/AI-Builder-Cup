import { createTypedModule } from '@/di/typed-ioctopus';
import { DI_SYMBOLS } from '@/di/types';
import { createMetadataCrawlerUseCases } from '@/src/application/use-cases/metadata-crawler/metadata-crawler.use-cases';
import { createSourceMetadataUseCases } from '@/src/application/use-cases/metadata-crawler/source-metadata.use-cases';
import { CoreApiMetadataCrawlerRepository } from '@/src/infrastructure/repositories/core-api-metadata-crawler.repository';
import { CoreApiSourceMetadataRepository } from '@/src/infrastructure/repositories/core-api-source-metadata.repository';
import { createMetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import { createSourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';

export function createMetadataCrawlerModule() {
  const typedModule = createTypedModule();

  typedModule
    .bind(DI_SYMBOLS.MetadataCrawlerRepository)
    .toClass(CoreApiMetadataCrawlerRepository, [DI_SYMBOLS.CoreApiClient]);
  typedModule
    .bind(DI_SYMBOLS.SourceMetadataRepository)
    .toClass(CoreApiSourceMetadataRepository, [DI_SYMBOLS.CoreApiClient]);
  typedModule
    .bind(DI_SYMBOLS.MetadataCrawlerUseCases)
    .toHigherOrderFunction(createMetadataCrawlerUseCases, [DI_SYMBOLS.MetadataCrawlerRepository]);
  typedModule
    .bind(DI_SYMBOLS.MetadataCrawlerController)
    .toHigherOrderFunction(createMetadataCrawlerController, [DI_SYMBOLS.MetadataCrawlerUseCases]);
  typedModule
    .bind(DI_SYMBOLS.SourceMetadataUseCases)
    .toHigherOrderFunction(createSourceMetadataUseCases, [DI_SYMBOLS.SourceMetadataRepository]);
  typedModule
    .bind(DI_SYMBOLS.SourceMetadataController)
    .toHigherOrderFunction(createSourceMetadataController, [DI_SYMBOLS.SourceMetadataUseCases]);

  return typedModule;
}
