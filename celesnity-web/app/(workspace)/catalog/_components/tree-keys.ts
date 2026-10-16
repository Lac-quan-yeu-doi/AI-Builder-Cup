import type { TableRef } from '@/src/entities/models/catalog';
import type {
  NamespaceViewModel,
  TableSummaryViewModel,
} from '@/src/interface-adapters/presenters/catalog.presenter';

/**
 * Stable, collision-free identifiers for tree nodes and their cached state.
 * Segments are URL-encoded so identifiers containing `/` cannot alias.
 */

export function catalogKey(catalog: string): string {
  return encodeURIComponent(catalog);
}

export function namespaceKey(catalog: string, schema: string): string {
  return `${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}`;
}

export function namespaceKeyOf(namespace: NamespaceViewModel): string {
  return namespaceKey(namespace.catalog, namespace.name);
}

export function tableKey(catalog: string, schema: string, table: string): string {
  return `${encodeURIComponent(catalog)}/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`;
}

export function tableKeyOf(table: TableSummaryViewModel): string {
  return tableKey(table.catalog, table.schema, table.name);
}

export function tableRefKey(ref: TableRef): string {
  return tableKey(ref.catalog, ref.schema, ref.table);
}
