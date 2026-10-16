import type { ChartCollectionRepository } from '@/src/application/repositories/chart-collection.repository.interface';
import type {
  ChartCollection,
  CreateChartCollectionInput,
  UpdateChartCollectionInput,
} from '@/src/entities/models/chart-collection';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface CollectionDto {
  readonly id: string;
  readonly organization_id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly type: ChartCollection['kind'];
  readonly access?: ChartCollection['access'];
  readonly chart_count?: number;
  readonly archived_at?: string | null;
  readonly updated_at?: string;
  readonly children?: readonly CollectionDto[];
}

export class CoreApiChartCollectionRepository implements ChartCollectionRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async list(): Promise<readonly ChartCollection[]> {
    return (await this.request<readonly CollectionDto[]>('/chart-collections')).map(mapCollection);
  }

  public async create(input: CreateChartCollectionInput): Promise<ChartCollection> {
    return mapCollection(
      await this.request<CollectionDto>('/chart-collections', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          parent_id: input.parentId ?? null,
        }),
      }),
    );
  }

  public async update(id: string, input: UpdateChartCollectionInput): Promise<ChartCollection> {
    return mapCollection(
      await this.request<CollectionDto>(`/chart-collections/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, description: input.description }),
      }),
    );
  }

  public async move(id: string, parentId: string | null): Promise<ChartCollection> {
    return mapCollection(
      await this.request<CollectionDto>(`/chart-collections/${encodeURIComponent(id)}/moves`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_id: parentId }),
      }),
    );
  }

  public async archive(id: string): Promise<void> {
    await this.request<void>(`/chart-collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapCollection(dto: CollectionDto): ChartCollection {
  return {
    id: dto.id,
    organizationId: dto.organization_id,
    parentId: dto.parent_id,
    name: dto.name,
    description: dto.description ?? null,
    kind: dto.type,
    access: dto.access ?? 'VIEW',
    chartCount: dto.chart_count ?? 0,
    archivedAt: dto.archived_at ?? null,
    ...(dto.updated_at ? { updatedAt: dto.updated_at } : {}),
    children: (dto.children ?? []).map(mapCollection),
  };
}
