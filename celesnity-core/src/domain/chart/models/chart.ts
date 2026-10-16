import type { QueryDefinition } from '@domain/chart/models/query-definition';
import type {
  OutputColumn,
  VisualizationDefinition,
} from '@domain/chart/models/visualization-definition';

/**
 * Legacy chart vocabularies remain available to the compatibility adapter.
 * Canonical charts never use these fields as a source of truth; they are
 * populated with empty values only so older read-only consumers can continue
 * to deserialize a chart while the migration is in progress.
 */
export type ChartStatus = 'draft' | 'ready' | 'error';
export type ChartType = 'bar' | 'line' | 'area' | 'point' | 'pie' | 'arc' | 'scatter';
export interface ChartEncoding {
  readonly field: string;
  readonly type: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
  readonly aggregate?: string;
  readonly title?: string;
}
export type ChartEncodings = Readonly<
  Partial<Record<'x' | 'y' | 'color' | 'size' | 'shape' | 'tooltip' | 'facet', ChartEncoding>>
>;

export type ChartProvenance = 'MANUAL' | 'CHAT' | 'LEGACY';
export type LegacyChartState = 'NONE' | 'READ_ONLY' | 'MIGRATION_REQUIRED';

export interface Chart {
  readonly id: string;
  /** Legacy compatibility fields. Canonical writes never put result rows here. */
  readonly runId: string | null;
  readonly title: string;
  readonly chartType: string;
  readonly encodings: ChartEncodings;
  readonly data: readonly Record<string, unknown>[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly vlSpec: Readonly<Record<string, unknown>> | null;
  readonly sql: string | null;
  readonly status: ChartStatus;
  readonly errorMessage: string | null;
  readonly version: number;
  /** Canonical root metadata. Optional only for legacy records. */
  readonly organizationId?: string | null;
  readonly collectionId?: string | null;
  readonly ownerIdentityId?: string | null;
  readonly description?: string | null;
  readonly provenance?: ChartProvenance;
  readonly currentRevisionNumber?: number | null;
  readonly legacyState?: LegacyChartState;
  readonly archivedAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChartRevision {
  readonly id: string;
  readonly chartId: string;
  readonly revisionNumber: number;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly queryHash: string;
  readonly createdByIdentityId: string;
  readonly createdAt: string;
  readonly restoredFromRevisionNumber: number | null;
}
