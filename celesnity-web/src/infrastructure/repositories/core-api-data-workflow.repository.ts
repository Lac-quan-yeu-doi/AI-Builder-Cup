import type { DataWorkflowRepository } from '@/src/application/repositories/data-workflow.repository.interface';
import type {
  CreateDataWorkflowInput,
  DataWorkflowDetail,
  DataWorkflowPage,
  DataWorkflowSchedulePreview,
  DataWorkflowSchedule,
  DataWorkflowVersion,
  DataWorkflowRun,
  ListDataWorkflowsInput,
  RetryDataWorkflowNodeInput,
  StartedDataWorkflowRun,
  UpdateDataWorkflowInput,
} from '@/src/entities/models/data-workflow';
import { toWorkflowGraphDto } from '@/src/entities/models/data-workflow-graph';
import type { DataWorkflowPipelineTarget } from '@/src/entities/models/data-workflow-graph';
import type {
  DataWorkflowWatchSourceCapabilities,
  DataWorkflowWatchSourceCatalogPage,
  DataWorkflowWatchSourceCatalogQuery,
  DataWorkflowWatchSourceCatalogRelation,
  DataWorkflowWatchSourceCatalogService,
  DataWorkflowWatchSourceTrigger,
  DataWorkflowWatchSourceValidationResult,
} from '@/src/entities/models/data-workflow-watch-source';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromDataWorkflowResponse,
  fromDataWorkflowDetailResponse,
  fromDataWorkflowSchedulePreviewResponse,
  fromDataWorkflowRunResponse,
  fromDataWorkflowVersionResponse,
  type DataWorkflowResponseDto,
  type DataWorkflowPageResponseDto,
  type DataWorkflowSchedulePreviewResponseDto,
  type DataWorkflowVersionResponseDto,
  type DataWorkflowRunResponseDto,
  type DataWorkflowWatchSourceCapabilitiesResponseDto,
  type DataWorkflowWatchSourceValidationResponseDto,
  fromDataWorkflowWatchSourceCapabilitiesResponse,
  fromDataWorkflowWatchSourceCatalogRelationsResponse,
  fromDataWorkflowWatchSourceCatalogServicesResponse,
  fromDataWorkflowWatchSourceValidationResponse,
  fromDataWorkflowPipelineTargetResponse,
  type DataWorkflowWatchSourceCatalogPageResponseDto,
  type DataWorkflowWatchSourceCatalogRelationResponseDto,
  type DataWorkflowWatchSourceCatalogServiceResponseDto,
  type DataWorkflowPipelineTargetResponseDto,
} from '@/src/infrastructure/repositories/data-workflow-api.mapper';

export class CoreApiDataWorkflowRepository implements DataWorkflowRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(input: ListDataWorkflowsInput): Promise<DataWorkflowPage> {
    const query = new URLSearchParams({
      page: String(input.page),
      pageSize: String(input.pageSize),
    });
    try {
      const response = await this.transport.request<DataWorkflowPageResponseDto>(
        `/data-workflows?${query.toString()}`,
        { method: 'GET' },
      );
      return {
        items: response.data.map(fromDataWorkflowResponse),
        page: response.page,
        pageSize: response.pageSize,
        totalItems: response.totalItems,
      };
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async create(input: CreateDataWorkflowInput): Promise<DataWorkflowDetail> {
    return this.requestDetail('/data-workflows', {
      method: 'POST',
      body: JSON.stringify({
        draft: { name: input.draft.name, graph: toWorkflowGraphDto(input.draft.graph) },
        ...(input.paused === undefined ? {} : { paused: input.paused }),
      }),
    });
  }

  public async get(id: string): Promise<DataWorkflowDetail> {
    return this.requestDetail(`/data-workflows/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  public async update(input: UpdateDataWorkflowInput): Promise<DataWorkflowDetail> {
    return this.requestDetail(`/data-workflows/${encodeURIComponent(input.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        expectedRevision: input.expectedRevision,
        draft: { name: input.draft.name, graph: toWorkflowGraphDto(input.draft.graph) },
      }),
    });
  }

  public async publish(id: string, expectedRevision: number): Promise<DataWorkflowVersion> {
    try {
      const response = await this.transport.request<DataWorkflowVersionResponseDto>(
        `/data-workflows/${encodeURIComponent(id)}/versions`,
        { method: 'POST', body: JSON.stringify({ expectedRevision }) },
      );
      return fromDataWorkflowVersionResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async previewSchedule(
    id: string,
    source: 'DRAFT' | 'PUBLISHED',
    count: number,
  ): Promise<DataWorkflowSchedulePreview> {
    try {
      const response = await this.transport.request<DataWorkflowSchedulePreviewResponseDto>(
        `/data-workflows/${encodeURIComponent(id)}/schedule/preview`,
        { method: 'POST', body: JSON.stringify({ source, count }) },
      );
      return fromDataWorkflowSchedulePreviewResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async getSchedule(id: string): Promise<DataWorkflowSchedule> {
    try {
      return await this.transport.request<DataWorkflowSchedule>(
        `/data-workflows/${encodeURIComponent(id)}/schedule`,
        { method: 'GET' },
      );
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async setPaused(
    id: string,
    expectedRevision: number,
    paused: boolean,
  ): Promise<DataWorkflowDetail> {
    return this.requestDetail(`/data-workflows/${encodeURIComponent(id)}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ expectedRevision, paused }),
    });
  }

  public async listVersions(id: string, limit: number): Promise<readonly DataWorkflowVersion[]> {
    try {
      const response = await this.transport.request<readonly DataWorkflowVersionResponseDto[]>(
        `/data-workflows/${encodeURIComponent(id)}/versions?limit=${encodeURIComponent(String(limit))}`,
        { method: 'GET' },
      );
      return response.map(fromDataWorkflowVersionResponse);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async listRuns(id: string, limit: number): Promise<readonly DataWorkflowRun[]> {
    try {
      const response = await this.transport.request<readonly DataWorkflowRunResponseDto[]>(
        `/data-workflows/${encodeURIComponent(id)}/runs?limit=${encodeURIComponent(String(limit))}`,
        { method: 'GET' },
      );
      return response.map(fromDataWorkflowRunResponse);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async startRun(id: string): Promise<StartedDataWorkflowRun> {
    try {
      return await this.transport.request<StartedDataWorkflowRun>(
        `/data-workflows/${encodeURIComponent(id)}/runs`,
        { method: 'POST', body: JSON.stringify({ parameters: {} }) },
      );
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async retryNode(input: RetryDataWorkflowNodeInput): Promise<void> {
    try {
      await this.transport.request<void>(
        `/data-workflows/${encodeURIComponent(input.workflowId)}/runs/${encodeURIComponent(input.runId)}/retries`,
        {
          method: 'POST',
          body: JSON.stringify({
            nodeId: input.nodeId,
            expectedRevision: input.expectedRevision,
            acknowledgeWriteRisk: input.acknowledgeWriteRisk,
          }),
        },
      );
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async getWatchSourceCapabilities(
    databaseServiceId: string,
  ): Promise<DataWorkflowWatchSourceCapabilities> {
    try {
      const response = await this.transport.request<DataWorkflowWatchSourceCapabilitiesResponseDto>(
        `/data-workflows/watch-sources/${encodeURIComponent(databaseServiceId)}/capabilities`,
        { method: 'GET' },
      );
      return fromDataWorkflowWatchSourceCapabilitiesResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async listWatchSourceCatalog(
    query: DataWorkflowWatchSourceCatalogQuery = {},
  ): Promise<DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogService>> {
    try {
      const params = catalogQueryParams(query);
      const response = await this.transport.request<
        DataWorkflowWatchSourceCatalogPageResponseDto<DataWorkflowWatchSourceCatalogServiceResponseDto>
      >(`/data-workflows/watch-sources/catalog?${params.toString()}`, { method: 'GET' });
      return fromDataWorkflowWatchSourceCatalogServicesResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async listWatchSourceRelations(
    databaseServiceId: string,
    query: DataWorkflowWatchSourceCatalogQuery = {},
  ): Promise<DataWorkflowWatchSourceCatalogPage<DataWorkflowWatchSourceCatalogRelation>> {
    try {
      const params = catalogQueryParams(query);
      const response = await this.transport.request<
        DataWorkflowWatchSourceCatalogPageResponseDto<DataWorkflowWatchSourceCatalogRelationResponseDto>
      >(
        `/data-workflows/watch-sources/catalog/${encodeURIComponent(databaseServiceId)}/relations?${params.toString()}`,
        { method: 'GET' },
      );
      return fromDataWorkflowWatchSourceCatalogRelationsResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async validateWatchSource(
    trigger: DataWorkflowWatchSourceTrigger,
  ): Promise<DataWorkflowWatchSourceValidationResult> {
    try {
      const response = await this.transport.request<DataWorkflowWatchSourceValidationResponseDto>(
        `/data-workflows/watch-sources/${encodeURIComponent(trigger.databaseServiceId)}/validate`,
        { method: 'POST', body: JSON.stringify({ trigger }) },
      );
      return fromDataWorkflowWatchSourceValidationResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async listPipelineTargets(
    pipelineId: string,
    versionNumber: number,
  ): Promise<readonly DataWorkflowPipelineTarget[]> {
    try {
      const response = await this.transport.request<readonly DataWorkflowPipelineTargetResponseDto[]>(
        `/data-workflows/pipelines/${encodeURIComponent(pipelineId)}/versions/${encodeURIComponent(String(versionNumber))}/targets`,
        { method: 'GET' },
      );
      return response.map(fromDataWorkflowPipelineTargetResponse);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  private async requestDetail(path: string, init: RequestInit): Promise<DataWorkflowDetail> {
    try {
      const response = await this.transport.request<DataWorkflowResponseDto>(path, init);
      return fromDataWorkflowDetailResponse(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function catalogQueryParams(query: DataWorkflowWatchSourceCatalogQuery): URLSearchParams {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 50),
  });
  if (query.search?.trim()) params.set('search', query.search.trim());
  return params;
}
