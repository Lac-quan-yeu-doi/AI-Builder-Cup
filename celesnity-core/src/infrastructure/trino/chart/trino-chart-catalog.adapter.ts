import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import type {
  IChartCatalog,
  ResolvedChartRelation,
} from '@application/chart/interfaces/i-chart-catalog';
import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';
import type { CatalogResourceRef } from '@application/administration/catalog-authorization';
import type { TableRef } from '@domain/chart/models/query-definition';
import type {
  ChartFieldMetadata,
  IChartFieldMetadataReader,
} from '@application/chart/interfaces/i-chart-field-metadata.reader';
import type { ICatalogReader } from '@application/catalog-exploration/interfaces/i-catalog-reader';
import { TablePath } from '@domain/catalog-exploration/value-objects/catalog-value-objects';

/**
 * Catalog anti-corruption adapter for chart queries. Iceberg/Parquet metadata
 * is consulted only for authorization; result rows never pass through this
 * port. The actor is explicit so callers cannot accidentally inherit a global
 * or service identity.
 */
@Injectable()
export class TrinoChartCatalogAdapter implements IChartCatalog, IChartFieldMetadataReader {
  public constructor(
    private readonly authorizer: CatalogAccessAuthorizer,
    private readonly reader?: ICatalogReader,
  ) {}

  public async resolveAndAuthorize(input: {
    readonly actor: ChartActor;
    readonly relations: readonly TableRef[];
  }): Promise<readonly ResolvedChartRelation[]> {
    if (!input.actor.organizationId || !input.actor.identityId) {
      throw new CatalogAccessDeniedError('DEFAULT_DENY');
    }
    const resolved: ResolvedChartRelation[] = [];
    for (const table of input.relations) {
      const databaseId = `${table.catalog}.${table.schema}`;
      const tableId = `${databaseId}.${table.table}`;
      const hierarchy: readonly CatalogResourceRef[] = [
        { type: 'CATALOG', id: table.catalog },
        { type: 'DATABASE', id: databaseId },
        { type: 'SCHEMA', id: databaseId },
        { type: 'TABLE', id: tableId },
      ];
      const decision = await this.authorizer.authorizeCatalog('SELECT', hierarchy);
      if (!decision.allowed) throw new CatalogAccessDeniedError(decision.reason);
      resolved.push({ table, fingerprint: fingerprint(table) });
    }
    return resolved;
  }

  public async list(input: {
    readonly actor: ChartActor;
    readonly relations: readonly TableRef[];
  }): Promise<readonly ChartFieldMetadata[]> {
    await this.resolveAndAuthorize(input);
    const reader = this.reader;
    if (!reader) throw new Error('Chart field metadata reader is unavailable.');
    const unique = new Map(input.relations.map((table) => [fingerprint(table), table]));
    const metadata = await Promise.all(
      [...unique.values()].map((table) =>
        reader.listColumns(TablePath.create(table.catalog, table.schema, table.table)),
      ),
    );
    return metadata.flatMap((table) =>
      table.columns.map((column) => ({
        table: { catalog: table.catalog, schema: table.schema, table: table.name },
        column: column.name,
        physicalType: column.dataType,
      })),
    );
  }
}

function fingerprint(table: TableRef): string {
  return createHash('sha256')
    .update(`${table.catalog}\0${table.schema}\0${table.table}`)
    .digest('hex');
}
