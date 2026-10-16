import type { Chart, ChartRevision } from '@domain/chart/models/chart';

export interface ChartWithRevision {
  readonly chart: Chart;
  readonly revision: ChartRevision;
}

export interface CreateCanonicalChartRecord {
  readonly chart: Chart;
  readonly revision: ChartRevision;
}

export interface UpdateCanonicalChartRecord {
  readonly chart: Chart;
  readonly revision: ChartRevision;
  readonly expectedRevisionNumber: number;
}

export interface RestoreChartRevisionRecord {
  readonly chart: Chart;
  readonly revision: ChartRevision;
  readonly expectedRevisionNumber: number;
}

export interface ListChartsRecord {
  readonly organizationId: string;
  readonly collectionId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface IChartRepository {
  /** Legacy compatibility methods. Canonical authoring uses ICanonicalChartRepository. */
  create(chart: Chart): Promise<Chart>;
  findById(id: string): Promise<Chart | null>;
  update(chart: Chart, expectedVersion?: number): Promise<Chart | null>;
  delete(id: string, expectedVersion?: number): Promise<boolean>;
  list(cursor: string | undefined, limit: number): Promise<readonly Chart[]>;
}

/** Canonical persistence port; intentionally has no result-data methods. */
export interface ICanonicalChartRepository {
  createCanonical(input: CreateCanonicalChartRecord): Promise<ChartWithRevision>;
  updateCanonical(input: UpdateCanonicalChartRecord): Promise<ChartWithRevision | null>;
  restoreRevision(input: RestoreChartRevisionRecord): Promise<ChartWithRevision | null>;
  findCanonicalById(organizationId: string, chartId: string): Promise<ChartWithRevision | null>;
  listCanonical(input: ListChartsRecord): Promise<readonly Chart[]>;
  listRevisions(organizationId: string, chartId: string): Promise<readonly ChartRevision[]>;
  moveCanonical(
    organizationId: string,
    chartId: string,
    collectionId: string,
    updatedAt: string,
  ): Promise<Chart | null>;
  archiveCanonical(
    organizationId: string,
    chartId: string,
    archivedAt: string,
  ): Promise<Chart | null>;
}
