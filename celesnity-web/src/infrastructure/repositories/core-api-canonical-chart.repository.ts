import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type {
  CanonicalChart,
  ChartCapability,
  ChartDraft,
  ChartPreview,
  ChartRevision,
  ChartSummary,
  CompiledChartQuery,
  CreateCanonicalChartInput,
  OutputColumn,
  QueryDefinition,
  VisualizationDefinition,
} from '@/src/entities/models/canonical-chart';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ChartPreviewDto {
  readonly run_id: string;
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly (string | number | boolean | null)[])[];
  readonly row_count: number;
  readonly byte_count: number;
  readonly truncated: boolean;
}

interface CanonicalChartDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly organization_id: string;
  readonly collection_id: string;
  readonly owner_identity_id: string;
  readonly provenance: 'MANUAL' | 'CHAT' | 'LEGACY';
  readonly current_revision_number: number;
  readonly query_definition: QueryDefinition;
  readonly visualization_definition: VisualizationDefinition;
  readonly output_schema: readonly OutputColumn[];
  readonly created_at: string;
  readonly updated_at: string;
}

interface RevisionDto {
  readonly chart_id: string;
  readonly revision_number: number;
  readonly title?: string;
  readonly query_definition: QueryDefinition;
  readonly visualization_definition: VisualizationDefinition;
  readonly output_schema: readonly OutputColumn[];
  readonly created_at: string;
  readonly restored_from_revision_number?: number | null;
}

interface LegacyRevisionDto {
  readonly chartId: string;
  readonly revisionNumber: number;
  readonly queryDefinition: QueryDefinition;
  readonly visualizationDefinition: VisualizationDefinition;
  readonly outputSchema: readonly OutputColumn[];
  readonly createdAt: string;
  readonly restoredFromRevisionNumber?: number | null;
}

interface CompiledChartQueryDto {
  readonly mode: QueryDefinition['mode'];
  readonly context: { readonly catalog: string; readonly schema: string };
  readonly sql: string;
}

export class CoreApiCanonicalChartRepository implements CanonicalChartRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async getCapabilities(): Promise<readonly ChartCapability[]> {
    return this.request<readonly ChartCapability[]>('/chart-authoring/capabilities', {
      method: 'GET',
    });
  }

  public async previewQuery(input: {
    readonly queryDefinition: QueryDefinition;
    readonly parameterValues: ChartDraft['parameterValues'];
  }): Promise<ChartPreview> {
    return mapPreview(
      await this.request<ChartPreviewDto>('/chart-authoring/query-previews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query_definition: input.queryDefinition,
          parameter_values: input.parameterValues,
        }),
      }),
    );
  }

  public async preview(input: ChartDraft): Promise<ChartPreview> {
    return mapPreview(
      await this.request<ChartPreviewDto>('/chart-authoring/previews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mapDraftRequest(input)),
      }),
    );
  }

  public async compileQuery(input: {
    readonly queryDefinition: QueryDefinition;
    readonly parameterValues: ChartDraft['parameterValues'];
  }): Promise<CompiledChartQuery> {
    return mapCompiledQuery(
      await this.request<CompiledChartQueryDto>('/chart-authoring/query-compilations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query_definition: input.queryDefinition,
          parameter_values: input.parameterValues,
        }),
      }),
    );
  }

  public async create(input: CreateCanonicalChartInput): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>('/chart-authoring/charts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mapDraftRequest(input)),
      }),
    );
  }

  public async saveChatPreview(input: CreateCanonicalChartInput): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>('/chart-authoring/chat-charts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          collection_id: input.collectionId,
          query_definition: input.queryDefinition,
          visualization_definition: input.visualizationDefinition,
          parameter_values: input.parameterValues,
        }),
      }),
    );
  }

  public async update(
    input: CreateCanonicalChartInput & {
      readonly chartId: string;
      readonly expectedRevision: number;
    },
  ): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>(
        `/chart-authoring/charts/${encodeURIComponent(input.chartId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...mapDraftRequest(input),
            expected_revision: input.expectedRevision,
          }),
        },
      ),
    );
  }

  public saveAsNew(input: CreateCanonicalChartInput): Promise<CanonicalChart> {
    return this.create(input);
  }

  public async get(id: string): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>(`/chart-authoring/charts/${encodeURIComponent(id)}`, {
        method: 'GET',
      }),
    );
  }

  public async list(collectionId?: string): Promise<readonly ChartSummary[]> {
    const query = collectionId ? `?collection_id=${encodeURIComponent(collectionId)}` : '';
    const rows = await this.request<readonly CanonicalChartDto[]>(
      `/chart-authoring/charts${query}`,
      {
        method: 'GET',
      },
    );
    return rows.map((row) => ({
      id: row.id,
      collectionId: row.collection_id,
      title: row.title,
      description: row.description ?? null,
      provenance: row.provenance,
      currentRevisionNumber: row.current_revision_number,
      updatedAt: row.updated_at,
    }));
  }

  public async runSaved(
    id: string,
    parameterValues: ChartDraft['parameterValues'],
  ): Promise<ChartPreview> {
    return mapPreview(
      await this.request<ChartPreviewDto>(
        `/chart-authoring/charts/${encodeURIComponent(id)}/runs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ parameter_values: parameterValues }),
        },
      ),
    );
  }

  public async cancelRun(input: {
    readonly chartId: string;
    readonly runId: string;
  }): Promise<void> {
    await this.request<void>(
      `/chart-authoring/charts/${encodeURIComponent(input.chartId)}/runs/${encodeURIComponent(input.runId)}/cancel`,
      { method: 'POST' },
    );
  }

  public async listRevisions(id: string): Promise<readonly ChartRevision[]> {
    const rows = await this.request<readonly (RevisionDto | LegacyRevisionDto)[]>(
      `/chart-authoring/charts/${encodeURIComponent(id)}/revisions`,
      { method: 'GET' },
    );
    return rows.map(mapRevision);
  }

  public async restoreRevision(input: {
    readonly chartId: string;
    readonly revisionNumber: number;
    readonly expectedRevision: number;
  }): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>(
        `/chart-authoring/charts/${encodeURIComponent(input.chartId)}/revisions/${input.revisionNumber}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expected_revision: input.expectedRevision,
            revision_number: input.revisionNumber,
          }),
        },
      ),
    );
  }

  public async move(id: string, collectionId: string): Promise<CanonicalChart> {
    return mapChart(
      await this.request<CanonicalChartDto>(
        `/chart-authoring/charts/${encodeURIComponent(id)}/moves`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ collection_id: collectionId }),
        },
      ),
    );
  }

  public async archive(id: string): Promise<void> {
    await this.request<void>(`/chart-authoring/charts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  private async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapDraftRequest(input: ChartDraft): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description,
    collection_id: input.collectionId,
    query_definition: input.queryDefinition,
    visualization_definition: input.visualizationDefinition,
    output_schema: input.outputSchema,
    parameter_values: input.parameterValues,
  };
}

function mapPreview(dto: ChartPreviewDto): ChartPreview {
  return {
    runId: dto.run_id,
    columns: dto.columns,
    rows: dto.rows,
    rowCount: dto.row_count,
    byteCount: dto.byte_count,
    truncated: dto.truncated,
  };
}

function mapCompiledQuery(dto: CompiledChartQueryDto): CompiledChartQuery {
  return {
    mode: dto.mode,
    context: dto.context,
    sql: dto.sql,
  };
}

function mapChart(dto: CanonicalChartDto): CanonicalChart {
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    collectionId: dto.collection_id,
    ownerIdentityId: dto.owner_identity_id,
    title: dto.title,
    description: dto.description,
    provenance: dto.provenance,
    currentRevisionNumber: dto.current_revision_number,
    queryDefinition: dto.query_definition,
    visualizationDefinition: dto.visualization_definition,
    outputSchema: dto.output_schema,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function mapRevision(dto: RevisionDto | LegacyRevisionDto): ChartRevision {
  const normalized =
    'revision_number' in dto
      ? dto
      : {
          chart_id: dto.chartId,
          revision_number: dto.revisionNumber,
          query_definition: dto.queryDefinition,
          visualization_definition: dto.visualizationDefinition,
          output_schema: dto.outputSchema,
          created_at: dto.createdAt,
          restored_from_revision_number: dto.restoredFromRevisionNumber,
        };
  return {
    chartId: normalized.chart_id,
    revisionNumber: normalized.revision_number,
    title:
      'title' in normalized
        ? (normalized.title ?? `Revision ${normalized.revision_number}`)
        : `Revision ${normalized.revision_number}`,
    queryDefinition: normalized.query_definition,
    visualizationDefinition: normalized.visualization_definition,
    outputSchema: normalized.output_schema,
    createdAt: normalized.created_at,
    restoredFromRevisionNumber: normalized.restored_from_revision_number ?? null,
  };
}
