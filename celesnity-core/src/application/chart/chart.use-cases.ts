import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import { ChartError } from '@domain/chart/errors/chart.errors';
import type { Chart, ChartEncodings, ChartStatus, ChartType } from '@domain/chart/models/chart';
import type { IChartRepository } from './interfaces/i-chart.repository';
import type { IChartRealtimeHub } from './interfaces/i-chart-realtime-hub';
import { assembleVegaLiteSpec } from './vega-lite-assembler';

const ALLOWED_CHART_TYPES: readonly ChartType[] = [
  'bar',
  'line',
  'area',
  'point',
  'pie',
  'arc',
  'scatter',
];

export interface CreateChartInput {
  readonly runId?: string;
  readonly title: string;
  readonly chartType: string;
  readonly encodings?: ChartEncodings;
  readonly data?: readonly Record<string, unknown>[];
  readonly config?: Readonly<Record<string, unknown>>;
  readonly sql: string;
}

export interface UpdateChartDataInput {
  readonly data: readonly Record<string, unknown>[];
  readonly expectedVersion?: number;
  /**
   * The SQL query whose result rows produced `data`, if any. `undefined`
   * preserves the chart's existing `sql`; `null` explicitly clears it (used
   * by the CSV-upload path, which has no query provenance).
   */
  readonly sql?: string | null;
}

export interface UpdateChartEncodingsInput {
  readonly encodings: ChartEncodings;
  readonly expectedVersion?: number;
}

export interface UpdateChartSpecInput {
  readonly vlSpec: Record<string, unknown>;
  readonly expectedVersion?: number;
}

export interface PatchChartInput {
  readonly expectedVersion?: number;
  readonly title?: string;
  readonly chartType?: string;
  readonly encodings?: ChartEncodings;
  readonly data?: readonly Record<string, unknown>[];
  readonly config?: Readonly<Record<string, unknown>>;
  readonly vlSpec?: Record<string, unknown>;
  /** `undefined` preserves the chart's existing `sql`; `null` clears it. */
  readonly sql?: string | null;
}

export class ChartUseCases {
  public constructor(
    private readonly repository: IChartRepository,
    private readonly clock: IClock,
    private readonly ids: IIdGenerator,
    private readonly realtime?: IChartRealtimeHub,
  ) {}

  public async create(input: CreateChartInput): Promise<Chart> {
    if (typeof input.sql !== 'string' || !input.sql.trim()) {
      throw ChartError.missingSql();
    }

    if (!isChartType(input.chartType)) {
      throw ChartError.invalidChartType(input.chartType);
    }

    const now = this.clock.now().toISOString();
    const encodings = input.encodings ?? {};
    const data = input.data ?? [];

    let vlSpec: Record<string, unknown> | null = null;
    let status: ChartStatus = 'draft';
    let errorMessage: string | null = null;

    // If we have enough info, assemble the spec immediately
    if (data.length > 0 && (encodings.x || encodings.y)) {
      try {
        vlSpec = assembleVegaLiteSpec({
          chartType: input.chartType,
          encodings,
          data,
          title: input.title,
          config: input.config,
        });
        status = 'ready';
      } catch (err) {
        status = 'error';
        errorMessage = err instanceof Error ? err.message : 'Unknown assembly error';
      }
    }

    const chart: Chart = {
      id: this.ids.next(),
      runId: input.runId ?? null,
      title: input.title,
      chartType: input.chartType,
      encodings,
      data,
      config: input.config ?? {},
      vlSpec,
      sql: input.sql ?? null,
      status,
      errorMessage,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repository.create(chart);
    this.realtime?.publishUpsert(saved);
    return saved;
  }

  public async setData(chartId: string, input: UpdateChartDataInput): Promise<Chart> {
    const chart = await this.getOrThrow(chartId);

    if (input.data.length === 0) {
      throw ChartError.missingData();
    }

    const updated = this.reassembleSpec({
      ...chart,
      data: input.data,
      sql: input.sql === undefined ? chart.sql : input.sql,
      updatedAt: this.clock.now().toISOString(),
      version: chart.version + 1,
    });

    return this.persist(updated, input.expectedVersion ?? chart.version);
  }

  public async setEncodings(chartId: string, input: UpdateChartEncodingsInput): Promise<Chart> {
    const chart = await this.getOrThrow(chartId);

    if (!input.encodings.x && !input.encodings.y) {
      throw ChartError.missingEncodings();
    }

    const updated = this.reassembleSpec({
      ...chart,
      encodings: input.encodings,
      updatedAt: this.clock.now().toISOString(),
      version: chart.version + 1,
    });

    return this.persist(updated, input.expectedVersion ?? chart.version);
  }

  public async setSpec(chartId: string, input: UpdateChartSpecInput): Promise<Chart> {
    const chart = await this.getOrThrow(chartId);

    const updated: Chart = {
      ...chart,
      vlSpec: input.vlSpec,
      status: 'ready',
      errorMessage: null,
      updatedAt: this.clock.now().toISOString(),
      version: chart.version + 1,
    };

    return this.persist(updated, input.expectedVersion ?? chart.version);
  }

  public async patch(chartId: string, input: PatchChartInput): Promise<Chart> {
    const chart = await this.getOrThrow(chartId);
    const expectedVersion = input.expectedVersion ?? chart.version;
    if (expectedVersion !== chart.version) {
      throw ChartError.versionConflict();
    }

    const chartType = input.chartType === undefined ? chart.chartType : input.chartType;
    if (!isChartType(chartType)) {
      throw ChartError.invalidChartType(chartType);
    }

    const structuralChange =
      input.chartType !== undefined || input.encodings !== undefined || input.data !== undefined;
    const updatedBase: Chart = {
      ...chart,
      title: input.title === undefined ? chart.title : input.title.trim(),
      chartType,
      encodings: input.encodings ?? chart.encodings,
      data: input.data ?? chart.data,
      config: input.config ?? chart.config,
      sql: input.sql === undefined ? chart.sql : input.sql,
      updatedAt: this.clock.now().toISOString(),
      version: chart.version + 1,
    };

    const updated =
      input.vlSpec !== undefined && !structuralChange
        ? {
            ...updatedBase,
            vlSpec: input.vlSpec,
            status: 'ready' as const,
            errorMessage: null,
          }
        : this.reassembleSpec(updatedBase);
    return this.persist(updated, expectedVersion);
  }

  public async findById(chartId: string): Promise<Chart> {
    return this.getOrThrow(chartId);
  }

  public async delete(chartId: string, expectedVersion?: number): Promise<void> {
    const chart = await this.getOrThrow(chartId);
    const deleted = await this.repository.delete(chartId, expectedVersion ?? chart.version);
    if (!deleted) {
      throw ChartError.versionConflict();
    }
    this.realtime?.publishDelete(chart.id);
  }

  public list(cursor?: string, limit?: number): Promise<readonly Chart[]> {
    return this.repository.list(cursor, Math.min(limit ?? 50, 200));
  }

  private async getOrThrow(chartId: string): Promise<Chart> {
    const chart = await this.repository.findById(chartId);
    if (!chart) {
      throw ChartError.notFound(chartId);
    }
    return chart;
  }

  private reassembleSpec(chart: Chart): Chart {
    if (chart.data.length === 0 || (!chart.encodings.x && !chart.encodings.y)) {
      return { ...chart, vlSpec: null, status: 'draft', errorMessage: null };
    }

    try {
      const vlSpec = assembleVegaLiteSpec({
        chartType: chart.chartType,
        encodings: chart.encodings,
        data: chart.data,
        title: chart.title,
        config: chart.config,
      });
      return { ...chart, vlSpec, status: 'ready', errorMessage: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown assembly error';
      return { ...chart, vlSpec: null, status: 'error', errorMessage: msg };
    }
  }

  private async persist(chart: Chart, expectedVersion: number): Promise<Chart> {
    const saved = await this.repository.update(chart, expectedVersion);
    if (saved === null) {
      throw ChartError.versionConflict();
    }
    this.realtime?.publishUpsert(saved);
    return saved;
  }
}

function isChartType(value: string): value is ChartType {
  return ALLOWED_CHART_TYPES.includes(value as ChartType);
}
