import type { MetadataCrawlerRepository } from '@/src/application/repositories/metadata-crawler.repository.interface';
import type {
  AssignMetadataCrawlerInput,
  MetadataCrawler,
  MetadataCrawlerAssignableService,
  MetadataCrawlerListPage,
  MetadataCrawlerLog,
  MetadataCrawlerRun,
  UpdateMetadataCrawlerInput,
} from '@/src/entities/models/metadata-crawler';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromMetadataCrawlerAssignableService,
  fromMetadataCrawlerListResponse,
  fromMetadataCrawlerLog,
  fromMetadataCrawlerResponse,
  fromMetadataCrawlerRun,
  toAssignMetadataCrawlerRequest,
  toUpdateMetadataCrawlerRequest,
  type MetadataCrawlerResponseDto,
  type MetadataCrawlerListResponseDto,
} from './metadata-crawler-api.mapper';

export class CoreApiMetadataCrawlerRepository implements MetadataCrawlerRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(includeArchived = false): Promise<MetadataCrawlerListPage> {
    const query = includeArchived ? '?includeArchived=true' : '';
    return fromMetadataCrawlerListResponse(
      await this.request<MetadataCrawlerListResponseDto>(`/metadata-crawlers${query}`, {
        method: 'GET',
      }),
    );
  }

  public async get(id: string): Promise<MetadataCrawler> {
    return fromMetadataCrawlerResponse(
      await this.request<MetadataCrawlerResponseDto>(crawlerPath(id), { method: 'GET' }),
    );
  }

  public async listAssignableDatabaseServices(): Promise<
    readonly MetadataCrawlerAssignableService[]
  > {
    const response = await this.request<readonly MetadataCrawlerResponseDto[]>(
      '/metadata-crawler-database-services',
      { method: 'GET' },
    );
    return response.map(fromMetadataCrawlerAssignableService);
  }

  public async assign(input: AssignMetadataCrawlerInput): Promise<MetadataCrawler> {
    return fromMetadataCrawlerResponse(
      await this.request<MetadataCrawlerResponseDto>('/metadata-crawlers', {
        method: 'POST',
        body: JSON.stringify(toAssignMetadataCrawlerRequest(input)),
      }),
    );
  }

  public async update(id: string, input: UpdateMetadataCrawlerInput): Promise<MetadataCrawler> {
    return fromMetadataCrawlerResponse(
      await this.request<MetadataCrawlerResponseDto>(crawlerPath(id), {
        method: 'PATCH',
        body: JSON.stringify(toUpdateMetadataCrawlerRequest(input)),
      }),
    );
  }

  public archive(id: string): Promise<void> {
    return this.request<void>(crawlerPath(id), { method: 'DELETE' });
  }

  public async runNow(id: string): Promise<MetadataCrawlerRun> {
    return fromMetadataCrawlerRun(
      await this.request<MetadataCrawlerResponseDto>(`${crawlerPath(id)}/runs`, { method: 'POST' }),
    );
  }

  public async listRuns(id: string, limit = 50): Promise<readonly MetadataCrawlerRun[]> {
    const response = await this.request<readonly MetadataCrawlerResponseDto[]>(
      `${crawlerPath(id)}/runs?limit=${encodeURIComponent(String(limit))}`,
      { method: 'GET' },
    );
    return response.map(fromMetadataCrawlerRun);
  }

  public async getRunLogs(runId: string): Promise<MetadataCrawlerLog> {
    return fromMetadataCrawlerLog(
      await this.request<MetadataCrawlerResponseDto>(
        `/metadata-crawler-runs/${encodeURIComponent(runId)}/logs`,
        { method: 'GET' },
      ),
    );
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function crawlerPath(id: string): string {
  return `/metadata-crawlers/${encodeURIComponent(id)}`;
}
