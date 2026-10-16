import type { TableRef } from '@/src/entities/models/catalog';
import type {
  CatalogColumnViewModel,
  TableMetadataViewModel,
  TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';
import type { ListQueryCatalogsController } from '@/src/interface-adapters/controllers/queries/list-query-catalogs.controller';
import type { ListQueryNamespacesController } from '@/src/interface-adapters/controllers/queries/list-query-namespaces.controller';
import type { ListTablesController } from '@/src/interface-adapters/controllers/catalog/list-tables.controller';
import type { LoadTableMetadataController } from '@/src/interface-adapters/controllers/catalog/load-table-metadata.controller';

export interface DataSourceSelection {
  readonly catalog: string;
  readonly schema: string;
  readonly table?: string;
  readonly columns: readonly CatalogColumnViewModel[];
}

export interface DataSourceBrowserControllers {
  readonly listCatalogs: ListQueryCatalogsController;
  readonly listNamespaces: ListQueryNamespacesController;
  readonly listTables: ListTablesController;
  readonly loadTableMetadata: LoadTableMetadataController;
}

export interface DataSourcePickerProps {
  readonly mode: 'TABLE' | 'CONTEXT';
  readonly catalogLock?: string;
  readonly controllers: DataSourceBrowserControllers;
  readonly onSelect: (selection: DataSourceSelection) => void;
}

export type DataSourcePickerLevel = 'CATALOG' | 'NAMESPACE' | 'TABLE';

export interface DataSourceBrowserState {
  readonly catalogs: readonly { readonly name: string; readonly jdbcCatalogIdentity?: string }[];
  readonly namespaces: readonly { readonly catalog: string; readonly name: string }[];
  readonly tables: readonly TableSummaryViewModel[];
  readonly metadata: TableMetadataViewModel | null;
  readonly loading: 'CATALOGS' | 'NAMESPACES' | 'TABLES' | 'METADATA' | null;
  readonly error: string | null;
}

export interface DataSourceBrowserResult extends DataSourceBrowserState {
  readonly loadCatalogs: () => Promise<void>;
  readonly loadNamespaces: (catalog: string) => Promise<void>;
  readonly loadTables: (catalog: string, schema: string) => Promise<void>;
  readonly loadTableMetadata: (ref: TableRef) => Promise<TableMetadataViewModel | null>;
}
