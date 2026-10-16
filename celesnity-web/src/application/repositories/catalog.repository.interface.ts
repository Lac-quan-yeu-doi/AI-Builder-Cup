import type {
  Catalog,
  CatalogNamespaceScope,
  Namespace,
  TableMetadata,
  TablePreview,
  TablePreviewRequest,
  TableRef,
  TableSnapshot,
  TableSummary,
} from '@/src/entities/models/catalog';

export interface CatalogRepository {
  listCatalogs(): Promise<readonly Catalog[]>;
  listNamespaces(catalog: string, scope?: CatalogNamespaceScope): Promise<readonly Namespace[]>;
  createNamespace(catalog: string, name: string, description?: string): Promise<Namespace>;
  updateNamespaceDescription(
    catalog: string,
    name: string,
    description?: string,
  ): Promise<Namespace>;
  listTables(catalog: string, schema: string): Promise<readonly TableSummary[]>;
  getTableMetadata(ref: TableRef): Promise<TableMetadata>;
  listSnapshots(ref: TableRef): Promise<readonly TableSnapshot[]>;
  previewTable(request: TablePreviewRequest): Promise<TablePreview>;
}
