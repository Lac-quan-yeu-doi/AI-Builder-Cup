import type { PipelineRepository } from '@/src/application/repositories/pipeline.repository.interface';
import type {
  ListPipelinesQuery,
  NodePreview,
  NodePreviewColumn,
  Pipeline,
  PipelineAuthor,
  PipelineCompilation,
  PipelineDraft,
  PipelineEdge,
  PipelineGraph,
  PipelineNode,
  PipelinePage,
  PipelineSummary,
  PipelineExecutionAccepted,
  GeneratedPipelineScript,
  PipelineValidationIssue,
  PipelineValidationResult,
  PipelineNodeSchema,
  PreviewNodeInput,
  SavePipelineInput,
} from '@/src/entities/models/pipeline';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type PipelineCollectionResponseDto = components['schemas']['PipelineCollectionResponseDto'];
type SinglePipelineResponseDto = components['schemas']['SinglePipelineResponseDto'];
type PipelineSummaryResponseDto = components['schemas']['PipelineSummaryResponseDto'];
type PipelineDataResponseDto = components['schemas']['PipelineDataResponseDto'];
type PipelineValidationResponseDto = components['schemas']['PipelineValidationResponseDto'];
type PipelinePreviewResponseDto = components['schemas']['PipelinePreviewResponseDto'];
type SavePipelineDto = components['schemas']['SavePipelineDto'];
type UpdatePipelineDto = components['schemas']['UpdatePipelineDto'];
type PipelineGraphDto = components['schemas']['PipelineGraphDto'];

const DEFAULT_PAGE_SIZE = 20;

/**
 * The pipeline endpoints wrap their payload in `{ success, data, … }` and type
 * `graph`, `createdBy`, and the validation and preview payloads as open records,
 * so every one of them is unverified input decoded here rather than trusted.
 */
export class CoreApiPipelineRepository implements PipelineRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(query: ListPipelinesQuery): Promise<PipelinePage> {
    const search = new URLSearchParams({
      page: String(query.page ?? 1),
      pageSize: String(query.pageSize ?? DEFAULT_PAGE_SIZE),
    });
    const keyword = query.keyword?.trim();
    if (keyword) {
      search.set('keyword', keyword);
    }

    const response = await this.request<PipelineCollectionResponseDto>(
      `/pipelines?${search.toString()}`,
      { method: 'GET' },
    );

    return {
      items: response.data.map(mapSummary),
      page: response.pagination.page,
      pageSize: response.pagination.pageSize,
      totalItems: response.pagination.totalItems,
      totalPages: response.pagination.totalPages,
    };
  }

  public async get(pipelineId: string): Promise<Pipeline> {
    const response = await this.request<SinglePipelineResponseDto>(pipelinePath(pipelineId), {
      method: 'GET',
    });
    return mapPipeline(response.data);
  }

  public async create(draft: PipelineDraft): Promise<Pipeline> {
    const request: SavePipelineDto = {
      name: draft.name,
      // Where it is filed, from the moment it exists. A draft has no target
      // node yet, so nothing else can say which database it belongs to.
      ...(draft.databaseName ? { databaseName: draft.databaseName } : {}),
      ...(draft.description ? { description: draft.description } : {}),
      graph: mapGraphRequest(draft.graph),
    };
    const response = await this.request<SinglePipelineResponseDto>('/pipelines', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return mapPipeline(response.data);
  }

  public async save(pipelineId: string, input: SavePipelineInput): Promise<Pipeline> {
    const request: UpdatePipelineDto = {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      graph: mapGraphRequest(input.graph),
      version: input.version,
    };
    const response = await this.request<SinglePipelineResponseDto>(pipelinePath(pipelineId), {
      method: 'PUT',
      body: JSON.stringify(request),
    });
    return mapPipeline(response.data);
  }

  public async clone(pipelineId: string, name: string): Promise<Pipeline> {
    const response = await this.request<SinglePipelineResponseDto>(
      `${pipelinePath(pipelineId)}/clone`,
      { method: 'POST', body: JSON.stringify({ name }) },
    );
    return mapPipeline(response.data);
  }

  public archive(pipelineId: string): Promise<void> {
    return this.request<void>(pipelinePath(pipelineId), { method: 'DELETE' });
  }

  public async validateGraph(graph: PipelineGraph): Promise<PipelineValidationResult> {
    const response = await this.request<PipelineValidationResponseDto>('/pipelines/validate', {
      method: 'POST',
      body: JSON.stringify({ graph: mapGraphRequest(graph) }),
    });
    return decodeValidation(response.data);
  }

  public async validateEdge(
    graph: PipelineGraph,
    edge: PipelineEdge,
  ): Promise<PipelineValidationResult> {
    const response = await this.request<PipelineValidationResponseDto>('/pipelines/validate-edge', {
      method: 'POST',
      body: JSON.stringify({ graph: mapGraphRequest(graph), edge: mapEdgeRequest(edge) }),
    });
    return decodeValidation(response.data);
  }

  public async previewNode(
    pipelineId: string,
    nodeId: string,
    input: PreviewNodeInput,
  ): Promise<NodePreview> {
    const response = await this.request<PipelinePreviewResponseDto>(
      `${pipelinePath(pipelineId)}/nodes/${encodeURIComponent(nodeId)}/preview`,
      { method: 'POST', body: JSON.stringify(input) },
    );
    return decodePreview(response.data);
  }

  public async compile(pipelineId: string, version: number): Promise<PipelineCompilation> {
    const response = await this.request<unknown>(
      `${pipelinePath(pipelineId)}/versions/${encodeURIComponent(String(version))}/compile`,
      { method: 'POST' },
    );
    return decodeCompilation(response);
  }

  public async generatedScript(
    pipelineId: string,
    version: number,
  ): Promise<GeneratedPipelineScript> {
    const response = await this.request<unknown>(
      `${pipelinePath(pipelineId)}/versions/${encodeURIComponent(String(version))}/generated-script`,
      { method: 'GET' },
    );
    const compilation = decodeCompilation(response);
    if (compilation.source === undefined) {
      throw new Error('The Core API returned generated script metadata without source code.');
    }
    return { ...compilation, source: compilation.source };
  }

  public async run(pipelineId: string, version: number): Promise<PipelineExecutionAccepted> {
    const response = await this.request<unknown>(
      `${pipelinePath(pipelineId)}/versions/${encodeURIComponent(String(version))}/executions`,
      { method: 'POST' },
    );
    if (
      !isRecord(response) ||
      typeof response.executionId !== 'string' ||
      response.status !== 'QUEUED'
    ) {
      throw new Error('The Core API returned an invalid pipeline execution response.');
    }
    return { executionId: response.executionId, status: response.status };
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function decodeCompilation(value: unknown): PipelineCompilation {
  if (
    !isRecord(value) ||
    typeof value.pipelineId !== 'string' ||
    typeof value.pipelineVersionId !== 'string' ||
    typeof value.versionNumber !== 'number' ||
    typeof value.compilerVersion !== 'string' ||
    typeof value.semanticGraphSha256 !== 'string' ||
    typeof value.contentSha256 !== 'string' ||
    typeof value.contentSize !== 'number' ||
    typeof value.compiledAt !== 'string' ||
    (value.source !== undefined && typeof value.source !== 'string')
  ) {
    throw new Error('The Core API returned invalid pipeline compilation metadata.');
  }
  return {
    pipelineId: value.pipelineId,
    pipelineVersionId: value.pipelineVersionId,
    versionNumber: value.versionNumber,
    compilerVersion: value.compilerVersion,
    semanticGraphSha256: value.semanticGraphSha256,
    contentSha256: value.contentSha256,
    contentSize: value.contentSize,
    sourceMap: value.sourceMap,
    compiledAt: value.compiledAt,
    ...(value.source === undefined ? {} : { source: value.source }),
  };
}

function pipelinePath(pipelineId: string): string {
  return `/pipelines/${encodeURIComponent(pipelineId)}`;
}

function mapGraphRequest(graph: PipelineGraph): PipelineGraphDto {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      definitionType: node.definitionType,
      ...(node.resourceId ? { resourceId: node.resourceId } : {}),
      position: { x: node.position.x, y: node.position.y },
      config: { ...node.config },
    })),
    edges: graph.edges.map(mapEdgeRequest),
  };
}

function mapEdgeRequest(edge: PipelineEdge): PipelineGraphDto['edges'][number] {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    sourcePortId: edge.sourcePortId,
    targetNodeId: edge.targetNodeId,
    targetPortId: edge.targetPortId,
  };
}

function mapSummary(dto: PipelineSummaryResponseDto): PipelineSummary {
  const lastRunStatus = optionalString(dto.lastRunStatus);
  const lastRunAt = optionalString(dto.lastRunAt);
  // `targetDatabase` and `sourceConnectionIds` are read through an index rather
  // than a property because the checked-in OpenAPI types predate them; both are
  // validated here like every other field, and the cast disappears the next
  // time `npm run api:generate` runs against a Core that ships them.
  const summarized = dto as unknown as Record<string, unknown>;
  const databaseName = optionalString(summarized.databaseName);
  const targetDatabase = optionalString(summarized.targetDatabase);

  return {
    id: dto.id,
    name: dto.name,
    ...(dto.description ? { description: dto.description } : {}),
    status: 'DRAFT',
    version: dto.version,
    ...(lastRunStatus ? { lastRunStatus } : {}),
    ...(lastRunAt ? { lastRunAt } : {}),
    ...(databaseName ? { databaseName } : {}),
    ...(targetDatabase ? { targetDatabase } : {}),
    sourceConnectionIds: decodeStringArray(summarized.sourceConnectionIds),
    createdBy: decodeAuthor(dto.createdBy),
    updatedAt: dto.updatedAt,
  };
}

/** Unknown input: an older Core omits the field, and JSON can carry anything. */
function decodeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function mapPipeline(dto: PipelineDataResponseDto): Pipeline {
  return {
    id: dto.id,
    name: dto.name,
    ...(dto.databaseName ? { databaseName: dto.databaseName } : {}),
    ...(dto.description ? { description: dto.description } : {}),
    status: 'DRAFT',
    version: dto.version,
    graph: decodeGraph(dto.graph),
    createdBy: decodeAuthor(dto.createdBy),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function decodeAuthor(value: unknown): PipelineAuthor {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string') {
    throw new Error('The Core API returned an invalid pipeline author.');
  }
  return { id: value.id, displayName: value.displayName };
}

function decodeGraph(value: unknown): PipelineGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error('The Core API returned an invalid pipeline graph.');
  }
  return {
    nodes: value.nodes.map(decodeNode),
    edges: value.edges.map(decodeEdge),
  };
}

function decodeNode(value: unknown): PipelineNode {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.definitionType !== 'string' ||
    !isRecord(value.position) ||
    typeof value.position.x !== 'number' ||
    typeof value.position.y !== 'number' ||
    !isRecord(value.config) ||
    (value.resourceId !== undefined && typeof value.resourceId !== 'string')
  ) {
    throw new Error('The Core API returned an invalid pipeline node.');
  }

  return {
    id: value.id,
    definitionType: value.definitionType,
    ...(value.resourceId === undefined ? {} : { resourceId: value.resourceId }),
    position: { x: value.position.x, y: value.position.y },
    config: value.config,
  };
}

function decodeEdge(value: unknown): PipelineEdge {
  if (
    !isRecord(value) ||
    typeof value.sourceNodeId !== 'string' ||
    typeof value.sourcePortId !== 'string' ||
    typeof value.targetNodeId !== 'string' ||
    typeof value.targetPortId !== 'string'
  ) {
    throw new Error('The Core API returned an invalid pipeline edge.');
  }

  // The identifier is optional in the contract; the canvas addresses edges by
  // id, so a saved edge without one is given a deterministic fallback.
  const id =
    typeof value.id === 'string' && value.id
      ? value.id
      : `${value.sourceNodeId}:${value.sourcePortId}->${value.targetNodeId}:${value.targetPortId}`;

  return {
    id,
    sourceNodeId: value.sourceNodeId,
    sourcePortId: value.sourcePortId,
    targetNodeId: value.targetNodeId,
    targetPortId: value.targetPortId,
  };
}

function decodeValidation(value: unknown): PipelineValidationResult {
  if (!isRecord(value) || typeof value.valid !== 'boolean' || !Array.isArray(value.errors)) {
    throw new Error('The Core API returned an invalid validation result.');
  }
  return {
    valid: value.valid,
    errors: value.errors.map(decodeIssue),
    // Edge validation answers with `valid` and `errors` only.
    warnings: Array.isArray(value.warnings) ? value.warnings.map(decodeIssue) : [],
    ...(isRecord(value.nodeSchemas) ? { nodeSchemas: decodeNodeSchemas(value.nodeSchemas) } : {}),
  };
}

function decodeNodeSchemas(value: unknown): Readonly<Record<string, PipelineNodeSchema>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([nodeId, schema]) => {
      if (
        !isRecord(schema) ||
        !['KNOWN', 'RUNTIME_DEPENDENT', 'UNAVAILABLE'].includes(String(schema.status)) ||
        !Array.isArray(schema.columns)
      ) {
        return [];
      }
      const columns = schema.columns.flatMap((column) =>
        isRecord(column) &&
        typeof column.name === 'string' &&
        typeof column.dataType === 'string' &&
        typeof column.nullable === 'boolean'
          ? [{ name: column.name, dataType: column.dataType, nullable: column.nullable }]
          : [],
      );
      return [[nodeId, { status: schema.status, columns } as PipelineNodeSchema]];
    }),
  );
}

function decodeIssue(value: unknown): PipelineValidationIssue {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') {
    throw new Error('The Core API returned an invalid validation issue.');
  }
  return {
    code: value.code,
    message: value.message,
    ...(typeof value.nodeId === 'string' ? { nodeId: value.nodeId } : {}),
    ...(typeof value.edgeId === 'string' ? { edgeId: value.edgeId } : {}),
    ...(typeof value.field === 'string' ? { field: value.field } : {}),
  };
}

function decodePreview(value: unknown): NodePreview {
  if (
    !isRecord(value) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.rows) ||
    typeof value.returnedRows !== 'number' ||
    typeof value.truncated !== 'boolean' ||
    typeof value.executionTimeMs !== 'number'
  ) {
    throw new Error('The Core API returned an invalid node preview.');
  }

  return {
    columns: value.columns.map(decodePreviewColumn),
    rows: value.rows.map((row) => {
      if (!isRecord(row)) {
        throw new Error('The Core API returned an invalid node preview row.');
      }
      return row;
    }),
    returnedRows: value.returnedRows,
    truncated: value.truncated,
    executionTimeMs: value.executionTimeMs,
  };
}

function decodePreviewColumn(value: unknown): NodePreviewColumn {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.dataType !== 'string' ||
    typeof value.nullable !== 'boolean'
  ) {
    throw new Error('The Core API returned an invalid node preview column.');
  }
  return { name: value.name, dataType: value.dataType, nullable: value.nullable };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
