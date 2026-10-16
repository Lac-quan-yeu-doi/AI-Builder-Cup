import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import type {
  Chart,
  ChartStatus,
  ChartType,
  CreateChartInput,
  PatchChartInput,
} from '@/src/entities/models/chart';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ChartResponseDto {
  id: string;
  run_id: string | null;
  title: string;
  chart_type: string;
  encodings: Record<string, unknown>;
  data: readonly Record<string, unknown>[];
  config: Record<string, unknown>;
  vl_spec: Record<string, unknown> | null;
  sql: string | null;
  status: string;
  error_message: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export class CoreApiChartRepository implements ChartRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly Chart[]> {
    const response = await this.request<ChartResponseDto[]>(chartsPath(), {
      method: 'GET',
    });
    return response.map(mapChart);
  }

  public async create(input: CreateChartInput): Promise<Chart> {
    const response = await this.request<ChartResponseDto>(chartsPath(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        chart_type: input.chartType,
        ...(input.runId ? { run_id: input.runId } : {}),
        encodings: input.encodings ?? {},
        data: input.data ?? [],
        config: input.config ?? {},
        ...(input.sql === undefined ? {} : { sql: input.sql }),
      }),
    });
    return mapChart(response);
  }

  public async patch(id: string, input: PatchChartInput, expectedVersion: number): Promise<Chart> {
    const response = await this.request<ChartResponseDto>(chartPath(id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.chartType === undefined ? {} : { chart_type: input.chartType }),
        ...(input.encodings === undefined ? {} : { encodings: input.encodings }),
        ...(input.data === undefined ? {} : { data: input.data }),
        ...(input.config === undefined ? {} : { config: input.config }),
        ...(input.vlSpec === undefined ? {} : { vl_spec: input.vlSpec }),
        ...(input.sql === undefined ? {} : { sql: input.sql }),
        expected_version: expectedVersion,
      }),
    });
    return mapChart(response);
  }

  public async delete(id: string, expectedVersion: number): Promise<void> {
    await this.request<void>(`${chartPath(id)}?expected_version=${expectedVersion}`, {
      method: 'DELETE',
    });
  }

  public async setDataFromCsv(id: string, file: File, expectedVersion: number): Promise<Chart> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.request<ChartResponseDto>(
      `${chartPath(id)}/data/csv?expected_version=${expectedVersion}`,
      { method: 'POST', body: formData },
    );
    return mapChart(response);
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function chartsPath(): string {
  return '/charts';
}

function chartPath(chartId: string): string {
  return `${chartsPath()}/${encodeURIComponent(chartId)}`;
}

function mapChart(dto: ChartResponseDto): Chart {
  return {
    id: dto.id,
    runId: dto.run_id,
    title: dto.title,
    chartType: dto.chart_type as ChartType,
    encodings: dto.encodings,
    data: dto.data,
    config: dto.config,
    vlSpec: dto.vl_spec,
    sql: dto.sql,
    status: dto.status as ChartStatus,
    errorMessage: dto.error_message,
    version: dto.version,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}
