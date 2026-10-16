import type {
  CopyDashboardInput,
  CreateDashboardInput,
  DashboardRepository,
} from '@/src/application/repositories/dashboard.repository.interface';
import type {
  Dashboard,
  DashboardCard,
  DashboardFilter,
  DashboardFilterMapping,
  DashboardSummary,
} from '@/src/entities/models/dashboard';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface DashboardSummaryDto {
  readonly id: string;
  readonly collection_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly expected_revision: number;
  readonly updated_at: string;
}

interface DashboardDto extends DashboardSummaryDto {
  readonly organization_id: string;
  readonly tabs: Dashboard['tabs'];
  readonly cards: readonly DashboardCardDto[];
  readonly filters: readonly DashboardFilterDto[];
  readonly mappings: readonly DashboardFilterMappingDto[];
  readonly created_by_identity_id: string;
  readonly archived_at: string | null;
  readonly created_at: string;
}

type DashboardCardDto =
  | {
      readonly id: string;
      readonly tab_id: string;
      readonly kind: 'CHART';
      readonly chart_id: string;
      readonly chart_revision_number: number | null;
      readonly visualization_overrides: Readonly<Record<string, unknown>>;
      readonly geometry: DashboardCard['geometry'];
    }
  | {
      readonly id: string;
      readonly tab_id: string;
      readonly kind: 'HEADING' | 'TEXT' | 'LINK';
      readonly content: Readonly<Record<string, string>>;
      readonly geometry: DashboardCard['geometry'];
    };

interface DashboardFilterDto {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly semantic_type: DashboardFilter['semanticType'];
  readonly operator: string;
  readonly default_value: unknown;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly values_source: Readonly<Record<string, unknown>> | null;
  readonly placement:
    { readonly kind: 'TOP_OF_PAGE' } | { readonly kind: 'INLINE_CARD'; readonly card_id: string };
  readonly order: number;
}

interface DashboardFilterMappingDto {
  readonly filter_id: string;
  readonly card_id: string;
  readonly target:
    | { readonly kind: 'FIELD'; readonly field_id: string }
    | { readonly kind: 'NATIVE_QUERY_VARIABLE'; readonly variable_key: string }
    | { readonly kind: 'CONTENT_VARIABLE'; readonly variable_name: string };
}

export class CoreApiDashboardRepository implements DashboardRepository {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async create(input: CreateDashboardInput): Promise<Dashboard> {
    return mapDashboard(
      await this.request<DashboardDto>('/dashboards', {
        method: 'POST',
        body: JSON.stringify({
          collection_id: input.collectionId,
          name: input.name,
          description: input.description,
        }),
      }),
    );
  }

  public async list(collectionId: string): Promise<readonly DashboardSummary[]> {
    const path = `/dashboards?collection_id=${encodeURIComponent(collectionId)}`;
    return (await this.request<readonly DashboardSummaryDto[]>(path)).map(mapDashboardSummary);
  }

  public async get(dashboardId: string): Promise<Dashboard> {
    return mapDashboard(
      await this.request<DashboardDto>(`/dashboards/${encodeURIComponent(dashboardId)}`),
    );
  }

  public async save(dashboard: Dashboard): Promise<Dashboard> {
    return mapDashboard(
      await this.request<DashboardDto>(`/dashboards/${encodeURIComponent(dashboard.id)}`, {
        method: 'PUT',
        body: JSON.stringify(toSaveDto(dashboard)),
      }),
    );
  }

  public async copy(input: CopyDashboardInput): Promise<Dashboard> {
    return mapDashboard(
      await this.request<DashboardDto>(
        `/dashboards/${encodeURIComponent(input.sourceDashboardId)}/copies`,
        {
          method: 'POST',
          body: JSON.stringify({
            collection_id: input.collectionId,
            name: input.name,
            draft: toSaveDto(input.draft),
          }),
        },
      ),
    );
  }

  public async archive(dashboardId: string): Promise<void> {
    await this.request<void>(`/dashboards/${encodeURIComponent(dashboardId)}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function mapDashboardSummary(dto: DashboardSummaryDto): DashboardSummary {
  return {
    id: dto.id,
    collectionId: dto.collection_id,
    name: dto.name,
    description: dto.description,
    revision: dto.expected_revision,
    updatedAt: dto.updated_at,
  };
}

function mapDashboard(dto: DashboardDto): Dashboard {
  return {
    ...mapDashboardSummary(dto),
    tabs: dto.tabs.map((tab) => ({ ...tab })),
    cards: dto.cards.map(mapCard),
    filters: dto.filters.map(mapFilter),
    mappings: dto.mappings.map(mapMapping),
    createdByIdentityId: dto.created_by_identity_id,
    archivedAt: dto.archived_at,
    createdAt: dto.created_at,
  };
}

function mapCard(dto: DashboardCardDto): DashboardCard {
  const base = { id: dto.id, tabId: dto.tab_id, geometry: { ...dto.geometry } };
  if (dto.kind === 'CHART') {
    return {
      ...base,
      kind: 'CHART',
      chartId: dto.chart_id,
      chartRevisionNumber: dto.chart_revision_number,
      visualizationOverrides: { ...dto.visualization_overrides },
    };
  }
  if (dto.kind === 'HEADING') {
    return { ...base, kind: 'HEADING', content: { text: dto.content.text ?? '' } };
  }
  if (dto.kind === 'TEXT') {
    return { ...base, kind: 'TEXT', content: { markdown: dto.content.markdown ?? '' } };
  }
  return {
    ...base,
    kind: 'LINK',
    content: { label: dto.content.label ?? '', url: dto.content.url ?? '' },
  };
}

function mapFilter(dto: DashboardFilterDto): DashboardFilter {
  return {
    id: dto.id,
    slug: dto.slug,
    label: dto.label,
    semanticType: dto.semantic_type,
    operator: dto.operator,
    defaultValue: dto.default_value,
    required: dto.required,
    multiple: dto.multiple,
    valuesSource: dto.values_source ? { ...dto.values_source } : null,
    placement:
      dto.placement.kind === 'TOP_OF_PAGE'
        ? { kind: 'TOP_OF_PAGE' }
        : { kind: 'INLINE_CARD', cardId: dto.placement.card_id },
    order: dto.order,
  };
}

function mapMapping(dto: DashboardFilterMappingDto): DashboardFilterMapping {
  const base = { filterId: dto.filter_id, cardId: dto.card_id };
  if (dto.target.kind === 'FIELD') {
    return { ...base, target: { kind: 'FIELD', fieldId: dto.target.field_id } };
  }
  if (dto.target.kind === 'NATIVE_QUERY_VARIABLE') {
    return {
      ...base,
      target: { kind: 'NATIVE_QUERY_VARIABLE', variableKey: dto.target.variable_key },
    };
  }
  return {
    ...base,
    target: { kind: 'CONTENT_VARIABLE', variableName: dto.target.variable_name },
  };
}

function toSaveDto(dashboard: Dashboard) {
  return {
    expected_revision: dashboard.revision,
    collection_id: dashboard.collectionId,
    name: dashboard.name,
    description: dashboard.description,
    tabs: dashboard.tabs.map((tab) => ({ ...tab })),
    cards: dashboard.cards.map((card) => ({
      id: card.id,
      tab_id: card.tabId,
      kind: card.kind,
      ...(card.kind === 'CHART'
        ? {
            chart_id: card.chartId,
            chart_revision_number: card.chartRevisionNumber,
            visualization_overrides: card.visualizationOverrides,
          }
        : { content: card.content }),
      geometry: card.geometry,
    })),
    filters: dashboard.filters.map((filter) => ({
      id: filter.id,
      slug: filter.slug,
      label: filter.label,
      semantic_type: filter.semanticType,
      operator: filter.operator,
      default_value: filter.defaultValue,
      required: filter.required,
      multiple: filter.multiple,
      values_source: filter.valuesSource,
      placement:
        filter.placement.kind === 'TOP_OF_PAGE'
          ? { kind: 'TOP_OF_PAGE' }
          : { kind: 'INLINE_CARD', card_id: filter.placement.cardId },
      order: filter.order,
    })),
    mappings: dashboard.mappings.map((mapping) => ({
      filter_id: mapping.filterId,
      card_id: mapping.cardId,
      target:
        mapping.target.kind === 'FIELD'
          ? { kind: 'FIELD', field_id: mapping.target.fieldId }
          : mapping.target.kind === 'NATIVE_QUERY_VARIABLE'
            ? { kind: 'NATIVE_QUERY_VARIABLE', variable_key: mapping.target.variableKey }
            : { kind: 'CONTENT_VARIABLE', variable_name: mapping.target.variableName },
    })),
  };
}
