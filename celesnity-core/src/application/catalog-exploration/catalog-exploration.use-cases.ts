import { Catalog, Namespace } from '@domain/catalog-exploration/models/catalog-models';
import type {
  ColumnProfile,
  TableMetadata,
  TableSnapshot,
  TableSummary,
} from '@domain/catalog-exploration/models/catalog-models';
import { CatalogError } from '@domain/catalog-exploration/errors/catalog.errors';
import {
  CatalogName,
  NamespaceName,
  TablePath,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';
import type {
  CatalogValueLookup,
  CatalogValueLookupResult,
  ICatalogReader,
  TablePreview,
} from '@application/catalog-exploration/interfaces/i-catalog-reader';
import type { ICatalogWriter } from '@application/catalog-exploration/interfaces/i-catalog-writer';
import type { ICatalogNamespaceMetadataRepository } from '@application/catalog-exploration/interfaces/i-catalog-namespace-metadata.repository';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import { CatalogMessage } from '@domain/catalog-exploration/errors/catalog.messages';
import {
  CatalogAccessDeniedError,
  type CatalogAccessAuthorizer,
} from '@application/catalog-exploration/catalog-access-authorizer';
import type { CatalogResourceRef } from '@application/administration/catalog-authorization';

/**
 * The fixed Iceberg JDBC catalog identity backing the Trino catalog alias.
 *
 * This is a deployment invariant (`iceberg.jdbc-catalog.catalog-name=celesnity`
 * in the Trino connector configuration) and is intentionally not configurable
 * through an environment variable (Requirement 4.1).
 */
const JDBC_CATALOG_IDENTITY = 'celesnity';
const RESERVED_NAMESPACES = new Set(['information_schema', 'system']);
const DESCRIPTION_MAX_LENGTH = 1000;
const EMPTY_NAMESPACE_METADATA: ICatalogNamespaceMetadataRepository = {
  listDescriptions: () => Promise.resolve(new Map()),
  setDescription: () => Promise.resolve(),
};
// A no-op cache (always misses) so callers that don't need profiling caching —
// tests, or a future consumer without a shared cache — don't have to wire one.
const EMPTY_COLUMN_PROFILE_CACHE: IColumnProfileCache = {
  get: () => undefined,
  set: () => undefined,
};

/**
 * Use cases for browsing the Iceberg catalog and creating managed namespaces through Trino.
 *
 * Every identifier supplied by a caller is validated into a value object before
 * it reaches the outbound reader, guaranteeing that only safe, quotable tokens
 * are ever used to compose SQL (Requirement 4.5).
 */
export class CatalogExplorationUseCases {
  public constructor(
    private readonly reader: ICatalogReader,
    private readonly writer: ICatalogWriter,
    private readonly configuredCatalog: string,
    private readonly previewMaxRows: number,
    private readonly authorizer: CatalogAccessAuthorizer,
    private readonly namespaceMetadata: ICatalogNamespaceMetadataRepository = EMPTY_NAMESPACE_METADATA,
    private readonly columnProfileCache: IColumnProfileCache = EMPTY_COLUMN_PROFILE_CACHE,
  ) {}

  /**
   * Exposes the single configured Trino catalog and its JDBC catalog identity
   * (Requirement 4.1). Only the deployment-managed catalog is enumerated.
   */
  public listCatalogs(): readonly Catalog[] {
    const catalog = CatalogName.create(this.configuredCatalog);
    return [Catalog.create(catalog.value, JDBC_CATALOG_IDENTITY)];
  }

  public async listVisibleCatalogs(): Promise<readonly Catalog[]> {
    const catalogs = this.listCatalogs();
    const visible = await Promise.all(
      catalogs.map(async (catalog) => ({
        catalog,
        decision: await this.authorizer.authorizeCatalog('DISCOVER', [
          { type: 'CATALOG', id: catalog.name },
        ]),
      })),
    );
    return visible.filter(({ decision }) => decision.allowed).map(({ catalog }) => catalog);
  }

  /** Lists the namespaces (schemas) visible within a catalog (Requirement 4.2). */
  public async listSchemas(catalogValue: string): Promise<readonly Namespace[]> {
    const catalog = CatalogName.create(catalogValue);
    await this.requireAccess('DISCOVER', [{ type: 'CATALOG', id: catalog.value }]);
    const namespaces = await this.reader.listSchemas(catalog);
    const visible = await Promise.all(
      namespaces.map(async (namespace) => ({
        namespace,
        decision: await this.authorizer.authorizeCatalog('DISCOVER', [
          { type: 'CATALOG', id: catalog.value },
          { type: 'SCHEMA', id: `${catalog.value}.${namespace.name}` },
        ]),
      })),
    );
    const allowed = visible
      .filter(({ decision }) => decision.allowed)
      .map(({ namespace }) => namespace);
    return this.withDescriptions(catalog.value, allowed);
  }

  public async listWritableSchemas(catalogValue: string): Promise<readonly Namespace[]> {
    return (await this.listSchemas(catalogValue)).filter(
      (namespace) => !isReservedNamespace(namespace.name),
    );
  }

  public async createSchema(
    catalogValue: string,
    schemaValue: string,
    descriptionValue?: string,
  ): Promise<Namespace> {
    const catalog = CatalogName.create(catalogValue);
    const configured = CatalogName.create(this.configuredCatalog);
    if (!catalog.equals(configured)) {
      throw CatalogError.validation('The catalog is not managed by this deployment.');
    }
    const schema = NamespaceName.create(schemaValue);
    // Namespace ownership is created together with the physical schema below,
    // so authorization at this point must target the parent catalog. Requiring
    // access to the not-yet-owned schema would make every legitimate create
    // fail the organization boundary in the authorization repository.
    await this.requireAccess('ALTER', [{ type: 'CATALOG', id: catalog.value }]);
    if (isReservedNamespace(schema.value)) {
      throw CatalogError.validation(CatalogMessage.namespaceReserved);
    }
    const exists = (await this.reader.listSchemas(catalog)).some(
      (namespace) => namespace.name.toLowerCase() === schema.value.toLowerCase(),
    );
    if (exists) {
      throw CatalogError.conflict(CatalogMessage.namespaceAlreadyExists);
    }
    const description = normalizeDescription(descriptionValue);
    const created = await this.writer.createNamespace(catalog, schema);
    // A row with a null description is still significant: it is the durable,
    // organization-scoped ownership record for this physical Iceberg schema.
    // Never make tenant isolation depend on whether a user entered prose.
    await this.namespaceMetadata.setDescription(catalog.value, schema.value, description);
    return Namespace.create(created.catalog, created.name, description);
  }

  public async updateSchemaDescription(
    catalogValue: string,
    schemaValue: string,
    descriptionValue?: string,
  ): Promise<Namespace> {
    const catalog = CatalogName.create(catalogValue);
    const configured = CatalogName.create(this.configuredCatalog);
    if (!catalog.equals(configured)) {
      throw CatalogError.validation('The catalog is not managed by this deployment.');
    }
    const schema = NamespaceName.create(schemaValue);
    await this.requireAccess('ALTER', [
      { type: 'CATALOG', id: catalog.value },
      { type: 'SCHEMA', id: `${catalog.value}.${schema.value}` },
    ]);
    const existing = (await this.reader.listSchemas(catalog)).find(
      (namespace) => namespace.name.toLowerCase() === schema.value.toLowerCase(),
    );
    if (!existing) throw CatalogError.notFound(CatalogMessage.namespaceNotFound);
    const description = normalizeDescription(descriptionValue);
    await this.namespaceMetadata.setDescription(catalog.value, existing.name, description);
    return Namespace.create(catalog.value, existing.name, description);
  }

  private async withDescriptions(
    catalog: string,
    namespaces: readonly Namespace[],
  ): Promise<readonly Namespace[]> {
    const descriptions = await this.namespaceMetadata.listDescriptions(
      catalog,
      namespaces.map((namespace) => namespace.name),
    );
    return namespaces.map((namespace) =>
      Namespace.create(namespace.catalog, namespace.name, descriptions.get(namespace.name)),
    );
  }

  /** Lists the tables and views within a namespace (Requirement 4.2). */
  public async listTables(
    catalogValue: string,
    schemaValue: string,
  ): Promise<readonly TableSummary[]> {
    const catalog = CatalogName.create(catalogValue);
    const schema = NamespaceName.create(schemaValue);
    const hierarchy = [
      { type: 'CATALOG' as const, id: catalog.value },
      { type: 'SCHEMA' as const, id: `${catalog.value}.${schema.value}` },
    ];
    await this.requireAccess('DISCOVER', hierarchy);
    const tables = await this.reader.listTables(catalog, schema);
    const visible = await Promise.all(
      tables.map(async (table) => ({
        table,
        decision: await this.authorizer.authorizeCatalog('DISCOVER', [
          ...hierarchy,
          { type: 'TABLE', id: `${catalog.value}.${schema.value}.${table.name}` },
        ]),
      })),
    );
    return visible.filter(({ decision }) => decision.allowed).map(({ table }) => table);
  }

  public async listWritableTables(
    catalogValue: string,
    schemaValue: string,
  ): Promise<readonly TableSummary[]> {
    if (isReservedNamespace(schemaValue)) {
      return [];
    }
    return (await this.listTables(catalogValue, schemaValue)).filter(
      (table) => table.tableType.toUpperCase() === 'BASE TABLE',
    );
  }

  /**
   * Lists a table's columns together with their Trino-visible data types
   * (Requirement 4.2).
   */
  public async listColumns(
    catalogValue: string,
    schemaValue: string,
    tableValue: string,
  ): Promise<TableMetadata> {
    const path = TablePath.create(catalogValue, schemaValue, tableValue);
    await this.requireAccess('DESCRIBE', tableHierarchy(path));
    return this.reader.listColumns(path);
  }

  /**
   * Lists the snapshots available through the Iceberg `$snapshots` system table
   * (Requirement 4.3).
   */
  public async listSnapshots(
    catalogValue: string,
    schemaValue: string,
    tableValue: string,
  ): Promise<readonly TableSnapshot[]> {
    const path = TablePath.create(catalogValue, schemaValue, tableValue);
    await this.requireAccess('DESCRIBE', tableHierarchy(path));
    return this.reader.listSnapshots(path);
  }

  /**
   * Previews a table with a server-side row limit sourced from configuration
   * (Requirement 4.4). The limit is validated defensively even though it comes
   * from validated environment configuration.
   */
  public async previewTable(
    catalogValue: string,
    schemaValue: string,
    tableValue: string,
    deviceId?: string,
  ): Promise<TablePreview> {
    const path = TablePath.create(catalogValue, schemaValue, tableValue);
    const maxRows = this.resolvePreviewLimit();
    await this.requireAccess('PREVIEW', tableHierarchy(path));
    return this.reader.previewTable(
      path,
      maxRows,
      deviceId === undefined ? undefined : { deviceId },
    );
  }

  public async lookupValues(
    catalogValue: string,
    schemaValue: string,
    tableValue: string,
    lookup: CatalogValueLookup,
  ): Promise<CatalogValueLookupResult> {
    const path = TablePath.create(catalogValue, schemaValue, tableValue);
    await this.requireAccess('PREVIEW', tableHierarchy(path));
    const metadata = await this.reader.listColumns(path);
    const known = new Set(metadata.columns.map((column) => column.name));
    const used = [
      lookup.valueColumn,
      ...(lookup.labelColumn === undefined ? [] : [lookup.labelColumn]),
      ...lookup.filters.map((filter) => filter.column),
      ...(lookup.orderBy === undefined ? [] : [lookup.orderBy.column]),
    ];
    if (used.some((column) => !known.has(column))) {
      throw CatalogError.validation('The lookup refers to a column that does not exist.');
    }
    if (this.reader.lookupValues === undefined) {
      throw CatalogError.unavailable();
    }
    return this.reader.lookupValues(path, lookup);
  }

  /**
   * Summarizes a table's columns — up to 100 distinct values per string
   * column, min/max/avg per numeric column — so an agent can ground SQL/chart
   * generation without pulling raw rows into its context. Gated by the same
   * PREVIEW permission as `previewTable` since it exposes real data values,
   * not just schema. Cached, since profiling scans the table.
   */
  public async profileTable(
    catalogValue: string,
    schemaValue: string,
    tableValue: string,
  ): Promise<readonly ColumnProfile[]> {
    const path = TablePath.create(catalogValue, schemaValue, tableValue);
    await this.requireAccess('PREVIEW', tableHierarchy(path));
    const cacheKey = `${path.catalog.value}.${path.schema.value}.${path.table.value}`;
    const cached = this.columnProfileCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const profile = await this.reader.profileTable(path);
    this.columnProfileCache.set(cacheKey, profile);
    return profile;
  }

  private resolvePreviewLimit(): number {
    if (!Number.isInteger(this.previewMaxRows) || this.previewMaxRows < 1) {
      throw CatalogError.validation(CatalogMessage.previewRowLimitInvalid);
    }
    return this.previewMaxRows;
  }

  private async requireAccess(
    permission: Parameters<CatalogAccessAuthorizer['authorizeCatalog']>[0],
    hierarchy: Parameters<CatalogAccessAuthorizer['authorizeCatalog']>[1],
  ): Promise<void> {
    const decision = await this.authorizer.authorizeCatalog(permission, hierarchy);
    if (!decision.allowed) throw new CatalogAccessDeniedError(decision.reason);
  }
}

function tableHierarchy(path: TablePath): readonly CatalogResourceRef[] {
  return [
    { type: 'CATALOG' as const, id: path.catalog.value },
    { type: 'SCHEMA' as const, id: `${path.catalog.value}.${path.schema.value}` },
    {
      type: 'TABLE' as const,
      id: `${path.catalog.value}.${path.schema.value}.${path.table.value}`,
    },
  ];
}

function isReservedNamespace(value: string): boolean {
  return RESERVED_NAMESPACES.has(value.trim().toLowerCase());
}

function normalizeDescription(value: string | undefined): string | undefined {
  const description = value?.trim();
  if (!description) return undefined;
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw CatalogError.validation(
      `Database description must not exceed ${DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }
  return description;
}
