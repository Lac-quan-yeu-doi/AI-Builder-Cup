import { ApiProperty } from '@nestjs/swagger';

import type { Chart } from '@domain/chart/models/chart';

export class ChartResponse {
  @ApiProperty({ format: 'uuid' })
  public readonly id: string;

  @ApiProperty({ nullable: true, type: String })
  public readonly run_id: string | null;

  @ApiProperty()
  public readonly title: string;

  @ApiProperty()
  public readonly chart_type: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly encodings: Record<string, unknown>;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public readonly data: readonly Record<string, unknown>[];

  @ApiProperty({ type: 'object', additionalProperties: true })
  public readonly config: Record<string, unknown>;

  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  public readonly vl_spec: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: String })
  public readonly sql: string | null;

  @ApiProperty({ enum: ['draft', 'ready', 'error'] })
  public readonly status: string;

  @ApiProperty({ nullable: true, type: String })
  public readonly error_message: string | null;

  @ApiProperty()
  public readonly version: number;

  @ApiProperty({ format: 'date-time' })
  public readonly created_at: string;

  @ApiProperty({ format: 'date-time' })
  public readonly updated_at: string;

  private constructor(chart: Chart) {
    this.id = chart.id;
    this.run_id = chart.runId;
    this.title = chart.title;
    this.chart_type = chart.chartType;
    this.encodings = chart.encodings;
    this.data = chart.data;
    this.config = chart.config;
    this.vl_spec = chart.vlSpec;
    this.sql = chart.sql;
    this.status = chart.status;
    this.error_message = chart.errorMessage;
    this.version = chart.version;
    this.created_at = chart.createdAt;
    this.updated_at = chart.updatedAt;
  }

  public static from(chart: Chart): ChartResponse {
    return new ChartResponse(chart);
  }

  public static fromList(charts: readonly Chart[]): readonly ChartResponse[] {
    return charts.map((chart) => ChartResponse.from(chart));
  }
}
