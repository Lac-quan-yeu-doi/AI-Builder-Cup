import { Module } from '@nestjs/common';

import type { INodeDefinitionReader } from '@application/node-catalog/interfaces/i-node-definition-reader';
import { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { NODE_DEFINITION_READER } from '@application/node-catalog/tokens';
import { CATALOG_SOURCE_BINDING_RESOLVER } from '@application/node-catalog/tokens';
import type { ICatalogSourceBindingResolver } from '@application/node-catalog/interfaces/i-catalog-source-binding-resolver';
import { PrismaNodeDefinitionReader } from '@infrastructure/prisma/node-catalog/prisma-node-definition.reader';
import { NodeCatalogController } from '@presentation/node-catalog/node-catalog.controller';
import { DatabaseServiceModule } from '@modules/database-service.module';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { DATABASE_SERVICE_READER } from '@application/database-service/tokens';
import type { IDatabaseServiceReader } from '@application/database-service/interfaces/i-database-service-reader';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import { PrismaCatalogSourceBindingResolver } from '@infrastructure/prisma/node-catalog/prisma-catalog-source-binding.resolver';

@Module({
  imports: [DatabaseServiceModule, CatalogExplorationModule],
  controllers: [NodeCatalogController],
  providers: [
    PrismaNodeDefinitionReader,
    PrismaCatalogSourceBindingResolver,
    { provide: NODE_DEFINITION_READER, useExisting: PrismaNodeDefinitionReader },
    {
      provide: CATALOG_SOURCE_BINDING_RESOLVER,
      useExisting: PrismaCatalogSourceBindingResolver,
    },
    {
      provide: NodeCatalogUseCases,
      inject: [
        NODE_DEFINITION_READER,
        DATABASE_SERVICE_READER,
        CatalogExplorationUseCases,
        CATALOG_SOURCE_BINDING_RESOLVER,
      ],
      useFactory: (
        reader: INodeDefinitionReader,
        connections: IDatabaseServiceReader,
        catalogs: CatalogExplorationUseCases,
        catalogSources: ICatalogSourceBindingResolver,
      ): NodeCatalogUseCases =>
        new NodeCatalogUseCases(reader, connections, catalogs, catalogSources),
    },
  ],
  exports: [NodeCatalogUseCases],
})
export class NodeCatalogModule {}
