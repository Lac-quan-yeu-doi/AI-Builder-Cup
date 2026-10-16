import type {
  Catalog,
  CatalogColumn,
  Namespace,
  PreviewColumn,
  TableMetadata,
  TablePreview,
  TableSnapshot,
  TableSummary,
} from '@/src/entities/models/catalog';

export interface CatalogViewModel {
  readonly name: string;
  readonly jdbcCatalogIdentity: string;
}

export interface NamespaceViewModel {
  readonly catalog: string;
  readonly name: string;
  readonly description?: string;
}

export interface TableSummaryViewModel {
  readonly catalog: string;
  readonly schema: string;
  readonly name: string;
  readonly tableType: string;
}

export interface CatalogColumnViewModel {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly ordinalPosition: number;
  readonly comment?: string;
}

export interface TableMetadataViewModel {
  readonly catalog: string;
  readonly schema: string;
  readonly name: string;
  readonly columns: readonly CatalogColumnViewModel[];
}

export interface TableSnapshotViewModel {
  readonly snapshotId: string;
  readonly parentId?: string;
  readonly committedAt: string;
  readonly operation?: string;
  readonly manifestList?: string;
  readonly summary: Readonly<Record<string, string>>;
}

export interface PreviewColumnViewModel {
  readonly name: string;
  readonly type: string;
}

export interface TablePreviewViewModel {
  readonly columns: readonly PreviewColumnViewModel[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
}

export function presentCatalog(catalog: Catalog): CatalogViewModel {
  return {
    name: catalog.name,
    jdbcCatalogIdentity: catalog.jdbcCatalogIdentity,
  };
}

export function presentCatalogs(catalogs: readonly Catalog[]): readonly CatalogViewModel[] {
  return catalogs.map(presentCatalog);
}

export function presentNamespace(namespace: Namespace): NamespaceViewModel {
  return {
    catalog: namespace.catalog,
    name: namespace.name,
    ...(namespace.description !== undefined ? { description: namespace.description } : {}),
  };
}

export function presentNamespaces(namespaces: readonly Namespace[]): readonly NamespaceViewModel[] {
  return namespaces.map(presentNamespace);
}

export function presentTableSummary(table: TableSummary): TableSummaryViewModel {
  return {
    catalog: table.catalog,
    schema: table.schema,
    name: table.name,
    tableType: table.tableType,
  };
}

export function presentTableSummaries(
  tables: readonly TableSummary[],
): readonly TableSummaryViewModel[] {
  return tables.map(presentTableSummary);
}

function presentCatalogColumn(column: CatalogColumn): CatalogColumnViewModel {
  return {
    name: column.name,
    dataType: column.dataType,
    nullable: column.nullable,
    ordinalPosition: column.ordinalPosition,
    ...(column.comment !== undefined ? { comment: column.comment } : {}),
  };
}

export function presentTableMetadata(metadata: TableMetadata): TableMetadataViewModel {
  return {
    catalog: metadata.catalog,
    schema: metadata.schema,
    name: metadata.name,
    columns: metadata.columns.map(presentCatalogColumn),
  };
}

export function presentTableSnapshot(snapshot: TableSnapshot): TableSnapshotViewModel {
  return {
    snapshotId: snapshot.snapshotId,
    committedAt: snapshot.committedAt,
    summary: { ...snapshot.summary },
    ...(snapshot.parentId !== undefined ? { parentId: snapshot.parentId } : {}),
    ...(snapshot.operation !== undefined ? { operation: snapshot.operation } : {}),
    ...(snapshot.manifestList !== undefined ? { manifestList: snapshot.manifestList } : {}),
  };
}

export function presentTableSnapshots(
  snapshots: readonly TableSnapshot[],
): readonly TableSnapshotViewModel[] {
  return snapshots.map(presentTableSnapshot);
}

function presentPreviewColumn(column: PreviewColumn): PreviewColumnViewModel {
  return { name: column.name, type: column.type };
}

export function presentTablePreview(preview: TablePreview): TablePreviewViewModel {
  return {
    columns: preview.columns.map(presentPreviewColumn),
    rows: preview.rows.map((row) => row.map(copyPreviewCell)),
    rowCount: preview.rowCount,
  };
}

function copyPreviewCell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyPreviewCell);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, copyPreviewCell(nestedValue)]),
    );
  }
  return value;
}
