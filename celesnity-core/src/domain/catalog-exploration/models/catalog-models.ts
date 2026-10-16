/**
 * Read models for the Catalog Exploration context.
 *
 * These are immutable projections of Trino-visible metadata. They contain no
 * behaviour beyond construction and never reference NestJS, HTTP, or Trino
 * transport concerns (Requirement 6.3).
 *
 * Each model lives in its own file; this remains the context's public surface so
 * consumers keep importing one well-known path. Sibling models import each other
 * directly rather than through here, so this barrel can never participate in an
 * import cycle.
 *
 * ## Why this context has no aggregate
 *
 * The other four contexts each own an aggregate, a repository, and domain events.
 * This one owns value objects, these metadata models, and narrow reader/writer
 * ports, and that asymmetry is correct rather than unfinished.
 *
 * Trino and Iceberg remain authoritative for namespace and table existence.
 * Celesnity owns only workspace annotations, such as an optional namespace
 * description, which are joined onto these read models by the application layer.
 *
 * What the context does own is a genuine domain rule, and it is enforced: every
 * identifier a caller supplies is parsed into a value object before it can reach
 * the reader, so only safe, quotable tokens are ever composed into SQL. That is
 * where the modelling effort belongs here.
 */
export { Catalog } from '@domain/catalog-exploration/models/catalog';
export { ColumnMetadata } from '@domain/catalog-exploration/models/column-metadata';
export {
  ColumnProfile,
  type ColumnProfileKind,
} from '@domain/catalog-exploration/models/column-profile';
export { Namespace } from '@domain/catalog-exploration/models/namespace';
export { TableMetadata } from '@domain/catalog-exploration/models/table-metadata';
export { TableSnapshot } from '@domain/catalog-exploration/models/table-snapshot';
export { TableSummary } from '@domain/catalog-exploration/models/table-summary';
