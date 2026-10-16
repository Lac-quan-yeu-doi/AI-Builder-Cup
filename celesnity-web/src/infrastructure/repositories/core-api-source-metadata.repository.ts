import type { SourceMetadataRepository } from '@/src/application/repositories/source-metadata.repository.interface';
import type {
  SourceColumnSort,
  SourceMetadataPage,
  SourceMetadataPageQuery,
  SourceMetadataSnapshotSummary,
  SourceNamespace,
  SourceNamespaceSort,
  SourceRelation,
  SourceRelationSort,
  SourceColumn,
  SourceConstraint,
} from '@/src/entities/models/source-metadata';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';
import {
  fromSourceColumnPage,
  fromSourceConstraints,
  fromSourceMetadataSummary,
  fromSourceNamespacePage,
  fromSourceRelation,
  fromSourceRelationPage,
  type SourceMetadataResponseDto,
} from './source-metadata-api.mapper';

export class CoreApiSourceMetadataRepository implements SourceMetadataRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async getSummary(crawlerId: string): Promise<SourceMetadataSnapshotSummary> {
    return fromSourceMetadataSummary(
      await this.request<SourceMetadataResponseDto>(`${metadataPath(crawlerId)}/summary`),
    );
  }

  public async listNamespaces(
    crawlerId: string,
    query: SourceMetadataPageQuery<SourceNamespaceSort>,
  ): Promise<SourceMetadataPage<SourceNamespace>> {
    return fromSourceNamespacePage(
      await this.request<SourceMetadataResponseDto>(
        `${metadataPath(crawlerId)}/namespaces?${queryString(query)}`,
      ),
    );
  }

  public async listRelations(
    crawlerId: string,
    namespaceId: string,
    query: SourceMetadataPageQuery<SourceRelationSort>,
  ): Promise<SourceMetadataPage<SourceRelation>> {
    return fromSourceRelationPage(
      await this.request<SourceMetadataResponseDto>(
        `${metadataPath(crawlerId)}/namespaces/${encodeURIComponent(namespaceId)}/relations?${queryString(query)}`,
      ),
    );
  }

  public async getRelation(crawlerId: string, relationId: string): Promise<SourceRelation> {
    return fromSourceRelation(
      await this.request<SourceMetadataResponseDto>(
        `${metadataPath(crawlerId)}/relations/${encodeURIComponent(relationId)}`,
      ),
    );
  }

  public async listColumns(
    crawlerId: string,
    relationId: string,
    query: SourceMetadataPageQuery<SourceColumnSort>,
  ): Promise<SourceMetadataPage<SourceColumn>> {
    return fromSourceColumnPage(
      await this.request<SourceMetadataResponseDto>(
        `${metadataPath(crawlerId)}/relations/${encodeURIComponent(relationId)}/columns?${queryString(query)}`,
      ),
    );
  }

  public async listConstraints(
    crawlerId: string,
    relationId: string,
  ): Promise<readonly SourceConstraint[]> {
    return fromSourceConstraints(
      await this.request<readonly SourceMetadataResponseDto[]>(
        `${metadataPath(crawlerId)}/relations/${encodeURIComponent(relationId)}/constraints`,
      ),
    );
  }

  private async request<TResponse>(path: string): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, { method: 'GET' });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function metadataPath(crawlerId: string): string {
  return `/metadata-crawlers/${encodeURIComponent(crawlerId)}/metadata`;
}

function queryString(query: SourceMetadataPageQuery<string>): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
  });
  if (query.search !== undefined && query.search.length > 0) params.set('search', query.search);
  return params.toString();
}
