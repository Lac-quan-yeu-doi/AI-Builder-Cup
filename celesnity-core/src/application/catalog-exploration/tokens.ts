/**
 * Dependency-injection tokens for the Catalog Exploration ports.
 *
 * Kept out of the port files so each of those declares an interface and its
 * parameter and result types, and nothing else.
 */
export const CATALOG_READER = Symbol('ICatalogReader');
export const CATALOG_WRITER = Symbol('ICatalogWriter');
export const CATALOG_NAMESPACE_METADATA = Symbol('ICatalogNamespaceMetadataRepository');
export const CATALOG_PROFILE_CACHE = Symbol('IColumnProfileCache');
