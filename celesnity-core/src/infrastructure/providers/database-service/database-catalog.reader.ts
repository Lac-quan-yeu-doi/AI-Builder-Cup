import { Inject, Injectable } from '@nestjs/common';

import type { IDatabaseCatalogReader } from '@application/database-service/interfaces/i-database-catalog-reader';
import { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';

/**
 * Adapts organization-visible Iceberg namespaces to the database-service
 * membership port. Catalog authorization and Trino error categorization stay
 * inside CatalogExplorationUseCases; this adapter only answers the boolean
 * question needed by the membership application service.
 */
@Injectable()
export class DatabaseCatalogReader implements IDatabaseCatalogReader {
  public constructor(
    @Inject(CatalogExplorationUseCases)
    private readonly catalogs: Pick<
      CatalogExplorationUseCases,
      'listVisibleCatalogs' | 'listWritableSchemas'
    >,
  ) {}

  public async exists(databaseName: string): Promise<boolean> {
    const normalizedName = databaseName.trim();
    if (normalizedName === '') return false;

    const catalogs = await this.catalogs.listVisibleCatalogs();
    for (const catalog of catalogs) {
      const namespaces = await this.catalogs.listWritableSchemas(catalog.name);
      if (namespaces.some((namespace) => namespace.name === normalizedName)) {
        return true;
      }
    }
    return false;
  }
}
