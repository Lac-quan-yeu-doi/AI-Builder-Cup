import { Module } from '@nestjs/common';

import { QueryWorkbenchModule } from '@modules/query-workbench.module';
import { CatalogExplorationModule } from '@modules/catalog-exploration.module';
import { TrinoMcpController } from '@presentation/trino/trino-mcp.controller';
import { AdministrationModule } from '@modules/administration.module';
import { SecurityModule } from '@modules/security.module';

@Module({
  imports: [SecurityModule, QueryWorkbenchModule, CatalogExplorationModule, AdministrationModule],
  controllers: [TrinoMcpController],
})
export class TrinoMcpModule {}
