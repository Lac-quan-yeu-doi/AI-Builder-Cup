import type {
  ColumnProfile,
  Namespace,
  TableMetadata,
  TableSnapshot,
  TableSummary,
} from '@domain/catalog-exploration/models/catalog-models';
import type {
  CatalogName,
  NamespaceName,
  TablePath,
} from '@domain/catalog-exploration/value-objects/catalog-value-objects';

/** A single column descriptor within a table preview result. */
export interface PreviewColumn {
  readonly name: string;
  readonly type: string;
}

/**
 * A bounded preview of a table's rows. `rows` is an array of positional cell
 * values aligned to `columns`. The number of rows never exceeds the
 * server-side limit applied by the use case (Requirement 4.4).
 */
export interface TablePreview {
  readonly columns: readonly PreviewColumn[];
  readonly rows: readonly (readonly unknown[])[];
}

/** Optional, narrowly-scoped filters supported by the catalog preview. */
export interface TablePreviewOptions {
  /**
   * Restricts a Device Management Bronze table to one backend device UUID.
   * The adapter maps this to the fixed `device_id` column; callers never
   * provide SQL identifiers or ordering expressions.
   */
  readonly deviceId?: string;
}

export interface CatalogValueLookup {
  readonly valueColumn: string;
  readonly labelColumn?: string;
  readonly filters: readonly {
    readonly column: string;
    readonly operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';
    readonly value: string | number | boolean | null;
  }[];
  readonly orderBy?: { readonly column: string; readonly direction: 'asc' | 'desc' };
  readonly limit: number;
}

export interface CatalogValueLookupResult {
  readonly rows: readonly {
    readonly value: string | number | boolean | null;
    readonly label: string;
  }[];
}

/**
 * Outbound port for reading Iceberg catalog metadata through Trino.
 *
 * Implementations are the sole place SQL is composed; they receive only
 * validated value objects and must double-quote every identifier. All Trino
 * failures must be translated into the domain's categorized errors so no
 * transport details leak upward.
 */
export interface ICatalogReader {
  listSchemas(catalog: CatalogName): Promise<readonly Namespace[]>;
  listTables(catalog: CatalogName, schema: NamespaceName): Promise<readonly TableSummary[]>;
  listColumns(path: TablePath): Promise<TableMetadata>;
  listSnapshots(path: TablePath): Promise<readonly TableSnapshot[]>;
  previewTable(
    path: TablePath,
    maxRows: number,
    options?: TablePreviewOptions,
  ): Promise<TablePreview>;
  /**
   * Computes a per-column summary of a table's data: up to 100 distinct
   * values for string columns whose approximate cardinality looks
   * categorical, min/max/avg for numeric columns. Never returns raw rows.
   */
  profileTable(path: TablePath): Promise<readonly ColumnProfile[]>;
  lookupValues?(path: TablePath, lookup: CatalogValueLookup): Promise<CatalogValueLookupResult>;
}
