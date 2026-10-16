import type { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

/**
 * Outbound port for caching table column profiles.
 *
 * Profiling scans the table (an `approx_distinct` pass plus, for categorical
 * columns, a `DISTINCT ... LIMIT 100`), so results are cached time-based —
 * there is no data-version signal available to invalidate on, only a TTL.
 */
export interface IColumnProfileCache {
  get(key: string): readonly ColumnProfile[] | undefined;
  set(key: string, value: readonly ColumnProfile[]): void;
}
