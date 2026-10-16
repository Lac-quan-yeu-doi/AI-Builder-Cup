/**
 * Catalog Explorer domain model.
 *
 * Pure, transport-agnostic types describing the Iceberg catalog as it is
 * exposed through Trino. Adapters translate Core API DTOs into these shapes;
 * presentation renders them. Nothing here depends on React, Next, or the
 * platform HTTP layer.
 */

/** A Trino-facing catalog and the underlying JDBC catalog identity it maps to. */
export interface Catalog {
  /** Trino-facing catalog alias (e.g. `iceberg`). */
  readonly name: string;
  /** Underlying Iceberg JDBC catalog identity (e.g. `celesnity`). */
  readonly jdbcCatalogIdentity: string;
}

/** A namespace (schema) that lives inside a catalog. */
export interface Namespace {
  readonly catalog: string;
  readonly name: string;
  readonly description?: string;
}

/** Whether namespace discovery is restricted to pipeline-writable schemas. */
export type CatalogNamespaceScope = 'writable' | 'readable';

/** A table or view exposed inside a namespace. */
export interface TableSummary {
  readonly catalog: string;
  readonly schema: string;
  readonly name: string;
  /** Trino table classification, e.g. `BASE TABLE` or `VIEW`. */
  readonly tableType: string;
}

/** A single column and the data type Trino reports for it. */
export interface CatalogColumn {
  readonly name: string;
  /** Trino-visible data type (e.g. `bigint`, `varchar`). */
  readonly dataType: string;
  readonly nullable: boolean;
  /** 1-based position of the column within the table. */
  readonly ordinalPosition: number;
  readonly comment?: string;
}

/** A table's fully-qualified identity together with its column metadata. */
export interface TableMetadata {
  readonly catalog: string;
  readonly schema: string;
  readonly name: string;
  readonly columns: readonly CatalogColumn[];
}

/** An Iceberg snapshot as surfaced through Trino system tables. */
export interface TableSnapshot {
  readonly snapshotId: string;
  readonly parentId?: string;
  readonly committedAt: string;
  readonly operation?: string;
  readonly manifestList?: string;
  /** Snapshot summary key/value pairs reported by Trino. */
  readonly summary: Readonly<Record<string, string>>;
}

/** A single column header within a table preview. */
export interface PreviewColumn {
  readonly name: string;
  readonly type: string;
}

/** A server-limited sample of table rows. */
export interface TablePreview {
  readonly columns: readonly PreviewColumn[];
  /** Row values aligned positionally to {@link TablePreview.columns}. */
  readonly rows: readonly (readonly unknown[])[];
  /** Number of rows returned in this preview. */
  readonly rowCount: number;
}

/** A fully-qualified reference to a single table. */
export interface TableRef {
  readonly catalog: string;
  readonly schema: string;
  readonly table: string;
}

/** A table preview request with an optional Device Management event scope. */
export interface TablePreviewRequest extends TableRef {
  readonly deviceId?: string;
}

/** Builds the dotted, fully-qualified name Trino uses for a table reference. */
export function qualifiedTableName(ref: TableRef): string {
  return `${ref.catalog}.${ref.schema}.${ref.table}`;
}
