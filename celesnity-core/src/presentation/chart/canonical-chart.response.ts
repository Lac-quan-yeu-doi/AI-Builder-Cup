import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Chart, ChartRevision } from '@domain/chart/models/chart';
import type { OutputColumn } from '@domain/chart/models/visualization-definition';

export class CanonicalChartResponse {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly organization_id!: string;
  @ApiProperty() public readonly collection_id!: string;
  @ApiProperty() public readonly owner_identity_id!: string;
  @ApiProperty({ enum: ['MANUAL', 'CHAT', 'LEGACY'] }) public readonly provenance!: string;
  @ApiProperty() public readonly current_revision_number!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly query_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly visualization_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public readonly output_schema!: readonly OutputColumn[];
  @ApiProperty() public readonly created_at!: string;
  @ApiProperty() public readonly updated_at!: string;

  private constructor(chart: Chart, revision: ChartRevision) {
    this.id = chart.id;
    this.title = chart.title;
    this.description = chart.description ?? null;
    this.organization_id = chart.organizationId ?? '';
    this.collection_id = chart.collectionId ?? '';
    this.owner_identity_id = chart.ownerIdentityId ?? '';
    this.provenance = chart.provenance ?? 'LEGACY';
    this.current_revision_number = chart.currentRevisionNumber ?? revision.revisionNumber;
    this.query_definition = revision.queryDefinition as unknown as Record<string, unknown>;
    this.visualization_definition = revision.visualizationDefinition as unknown as Record<
      string,
      unknown
    >;
    this.output_schema = revision.outputSchema;
    this.created_at = chart.createdAt;
    this.updated_at = chart.updatedAt;
  }

  public static from(chart: Chart, revision: ChartRevision): CanonicalChartResponse {
    return new CanonicalChartResponse(chart, revision);
  }
}

export class CanonicalChartSummaryResponse {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly title!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly collection_id!: string;
  @ApiProperty() public readonly provenance!: string;
  @ApiProperty() public readonly current_revision_number!: number;
  @ApiProperty() public readonly created_at!: string;
  @ApiProperty() public readonly updated_at!: string;

  private constructor(chart: Chart) {
    this.id = chart.id;
    this.title = chart.title;
    this.description = chart.description ?? null;
    this.collection_id = chart.collectionId ?? '';
    this.provenance = chart.provenance ?? 'LEGACY';
    this.current_revision_number = chart.currentRevisionNumber ?? 0;
    this.created_at = chart.createdAt;
    this.updated_at = chart.updatedAt;
  }

  public static from(chart: Chart): CanonicalChartSummaryResponse {
    return new CanonicalChartSummaryResponse(chart);
  }
}

export class CanonicalChartRevisionResponse {
  @ApiProperty() public readonly chart_id!: string;
  @ApiProperty() public readonly revision_number!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly query_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly visualization_definition!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public readonly output_schema!: readonly OutputColumn[];
  @ApiProperty() public readonly created_at!: string;
  @ApiPropertyOptional({ nullable: true })
  public readonly restored_from_revision_number!: number | null;

  private constructor(revision: ChartRevision) {
    this.chart_id = revision.chartId;
    this.revision_number = revision.revisionNumber;
    this.query_definition = revision.queryDefinition as unknown as Record<string, unknown>;
    this.visualization_definition = revision.visualizationDefinition as unknown as Record<
      string,
      unknown
    >;
    this.output_schema = revision.outputSchema;
    this.created_at = revision.createdAt;
    this.restored_from_revision_number = revision.restoredFromRevisionNumber ?? null;
  }

  public static from(revision: ChartRevision): CanonicalChartRevisionResponse {
    return new CanonicalChartRevisionResponse(revision);
  }
}

export class ChartRunPreviewResponse {
  @ApiProperty() public readonly run_id!: string;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  public readonly columns!: readonly OutputColumn[];
  @ApiProperty({ type: 'array', items: { type: 'array' } })
  public readonly rows!: readonly (readonly unknown[])[];
  @ApiProperty() public readonly row_count!: number;
  @ApiProperty() public readonly byte_count!: number;
  @ApiProperty() public readonly truncated!: boolean;

  public constructor(input: {
    readonly runId: string;
    readonly columns: readonly OutputColumn[];
    readonly rows: readonly (readonly unknown[])[];
    readonly rowCount: number;
    readonly byteCount: number;
    readonly truncated: boolean;
  }) {
    this.run_id = input.runId;
    this.columns = input.columns;
    this.rows = input.rows;
    this.row_count = input.rowCount;
    this.byte_count = input.byteCount;
    this.truncated = input.truncated;
  }
}

export class ChartQueryContextResponse {
  @ApiProperty() public readonly catalog!: string;
  @ApiProperty() public readonly schema!: string;
}

export class ChartQueryCompilationResponse {
  @ApiProperty({ enum: ['VISUAL', 'NATIVE'] }) public readonly mode!: 'VISUAL' | 'NATIVE';
  @ApiProperty({ type: ChartQueryContextResponse })
  public readonly context!: { readonly catalog: string; readonly schema: string };
  @ApiProperty() public readonly sql!: string;

  public constructor(input: {
    readonly mode: 'VISUAL' | 'NATIVE';
    readonly context: { readonly catalog: string; readonly schema: string };
    readonly sql: string;
  }) {
    Object.assign(this, input);
  }
}
