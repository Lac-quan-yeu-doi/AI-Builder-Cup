import type { CatalogRepository } from '@/src/application/repositories/catalog.repository.interface';
import type {
  Catalog,
  CatalogNamespaceScope,
  CatalogColumn,
  Namespace,
  PreviewColumn,
  TableMetadata,
  TablePreview,
  TablePreviewRequest,
  TableRef,
  TableSnapshot,
  TableSummary,
} from '@/src/entities/models/catalog';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import type { components } from '@/src/infrastructure/api/generated/schema';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

type CatalogResponseDto = components['schemas']['CatalogResponseDto'];
type NamespaceResponseDto = components['schemas']['NamespaceResponseDto'];
type CreateNamespaceDto = components['schemas']['CreateNamespaceDto'];
type UpdateNamespaceDescriptionDto = components['schemas']['UpdateNamespaceDescriptionDto'];
type TableSummaryResponseDto = components['schemas']['TableSummaryResponseDto'];
type TableMetadataResponseDto = components['schemas']['TableMetadataResponseDto'];
type ColumnMetadataResponseDto = components['schemas']['ColumnMetadataResponseDto'];
type TableSnapshotResponseDto = components['schemas']['TableSnapshotResponseDto'];
type TablePreviewResponseDto = components['schemas']['TablePreviewResponseDto'];
type PreviewColumnResponseDto = components['schemas']['PreviewColumnResponseDto'];

export class CoreApiCatalogRepository implements CatalogRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async listCatalogs(): Promise<readonly Catalog[]> {
    const response = await this.request<CatalogResponseDto[]>('/catalogs');
    return response.map(mapCatalog);
  }

  public async listNamespaces(
    catalog: string,
    scope: CatalogNamespaceScope = 'writable',
  ): Promise<readonly Namespace[]> {
    // `writable=true` drops `information_schema` and `system`. The UI presents
    // a namespace as a database a pipeline can write into, and those two are
    // not — the create path rejects them, so offering them would be a lie.
    const writableQuery = scope === 'writable' ? '?writable=true' : '';
    const response = await this.request<NamespaceResponseDto[]>(
      `/catalogs/${segment(catalog)}/schemas${writableQuery}`,
    );
    return response.map(mapNamespace);
  }

  public async createNamespace(
    catalog: string,
    name: string,
    description?: string,
  ): Promise<Namespace> {
    try {
      const body: CreateNamespaceDto = {
        name,
        ...(description !== undefined ? { description } : {}),
      };
      const response = await this.transport.request<NamespaceResponseDto>(
        `/catalogs/${segment(catalog)}/schemas`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      return mapNamespace(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async updateNamespaceDescription(
    catalog: string,
    name: string,
    description?: string,
  ): Promise<Namespace> {
    try {
      const body: UpdateNamespaceDescriptionDto = { description: description ?? null };
      const response = await this.transport.request<NamespaceResponseDto>(
        `/catalogs/${segment(catalog)}/schemas/${segment(name)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      return mapNamespace(response);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }

  public async listTables(catalog: string, schema: string): Promise<readonly TableSummary[]> {
    const response = await this.request<TableSummaryResponseDto[]>(
      `/catalogs/${segment(catalog)}/schemas/${segment(schema)}/tables`,
    );
    return response.map(mapTableSummary);
  }

  public async getTableMetadata(ref: TableRef): Promise<TableMetadata> {
    const response = await this.request<TableMetadataResponseDto>(`${tablePath(ref)}/columns`);
    return mapTableMetadata(response);
  }

  public async listSnapshots(ref: TableRef): Promise<readonly TableSnapshot[]> {
    const response = await this.request<TableSnapshotResponseDto[]>(`${tablePath(ref)}/snapshots`);
    return response.map(mapSnapshot);
  }

  public async previewTable(request: TablePreviewRequest): Promise<TablePreview> {
    const query =
      request.deviceId === undefined ? '' : `?deviceId=${encodeURIComponent(request.deviceId)}`;
    const response = await this.request<TablePreviewResponseDto>(
      `${tablePath(request)}/preview${query}`,
    );
    return mapPreview(response);
  }

  private async request<TResponse>(path: string): Promise<TResponse> {
    try {
      return await this.transport.request<TResponse>(path, { method: 'GET' });
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function tablePath(ref: TableRef): string {
  return `/catalogs/${segment(ref.catalog)}/schemas/${segment(ref.schema)}/tables/${segment(
    ref.table,
  )}`;
}

function mapCatalog(dto: CatalogResponseDto): Catalog {
  return { name: dto.name, jdbcCatalogIdentity: dto.jdbcCatalogIdentity };
}

function mapNamespace(dto: NamespaceResponseDto): Namespace {
  return {
    catalog: dto.catalog,
    name: dto.name,
    ...(dto.description !== undefined ? { description: dto.description } : {}),
  };
}

function mapTableSummary(dto: TableSummaryResponseDto): TableSummary {
  return {
    catalog: dto.catalog,
    schema: dto.schema,
    name: dto.name,
    tableType: dto.tableType,
  };
}

function mapColumn(dto: ColumnMetadataResponseDto): CatalogColumn {
  return {
    name: dto.name,
    dataType: dto.dataType,
    nullable: dto.nullable,
    ordinalPosition: dto.ordinalPosition,
    ...(dto.comment ? { comment: dto.comment } : {}),
  };
}

function mapTableMetadata(dto: TableMetadataResponseDto): TableMetadata {
  const columns = dto.columns
    .map(mapColumn)
    .slice()
    .sort((left, right) => left.ordinalPosition - right.ordinalPosition);

  return {
    catalog: dto.catalog,
    schema: dto.schema,
    name: dto.name,
    columns,
  };
}

function mapSnapshot(dto: TableSnapshotResponseDto): TableSnapshot {
  return {
    snapshotId: dto.snapshotId,
    committedAt: dto.committedAt,
    summary: dto.summary ?? {},
    ...(dto.parentId ? { parentId: dto.parentId } : {}),
    ...(dto.operation ? { operation: dto.operation } : {}),
    ...(dto.manifestList ? { manifestList: dto.manifestList } : {}),
  };
}

function mapPreviewColumn(dto: PreviewColumnResponseDto): PreviewColumn {
  return { name: dto.name, type: dto.type };
}

function mapPreview(dto: TablePreviewResponseDto): TablePreview {
  return {
    columns: dto.columns.map(mapPreviewColumn),
    rows: dto.rows.map((row) => row.map(copyPreviewCell)),
    rowCount: dto.rowCount,
  };
}

function copyPreviewCell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyPreviewCell);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, copyPreviewCell(nestedValue)]),
    );
  }
  return value;
}
