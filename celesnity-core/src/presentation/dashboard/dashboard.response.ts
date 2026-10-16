import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { DashboardSummary } from '@application/dashboard/interfaces/i-dashboard.repository';
import type { Dashboard } from '@domain/dashboard/models/dashboard';
import type { DashboardExecution } from '@application/dashboard/dashboard-execution.models';
import type { DashboardCardFilterTargets } from '@application/dashboard/interfaces/i-dashboard-filter-target.reader';

export class DashboardSummaryResponse {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly collection_id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly expected_revision!: number;
  @ApiProperty() public readonly updated_at!: string;

  public static from(summary: DashboardSummary): DashboardSummaryResponse {
    return Object.assign(new DashboardSummaryResponse(), {
      id: summary.id,
      collection_id: summary.collectionId,
      name: summary.title,
      description: summary.description,
      expected_revision: summary.revision,
      updated_at: summary.updatedAt,
    });
  }
}

export class DashboardResponse {
  @ApiProperty() public readonly id!: string;
  @ApiProperty() public readonly organization_id!: string;
  @ApiProperty() public readonly collection_id!: string;
  @ApiProperty() public readonly name!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly description!: string | null;
  @ApiProperty() public readonly expected_revision!: number;
  @ApiProperty({ type: 'array' }) public readonly tabs!: readonly object[];
  @ApiProperty({ type: 'array' }) public readonly cards!: readonly object[];
  @ApiProperty({ type: 'array' }) public readonly filters!: readonly object[];
  @ApiProperty({ type: 'array' }) public readonly mappings!: readonly object[];
  @ApiProperty() public readonly created_by_identity_id!: string;
  @ApiPropertyOptional({ nullable: true }) public readonly archived_at!: string | null;
  @ApiProperty() public readonly created_at!: string;
  @ApiProperty() public readonly updated_at!: string;

  public static from(dashboard: Dashboard): DashboardResponse {
    return Object.assign(new DashboardResponse(), {
      id: dashboard.id,
      organization_id: dashboard.organizationId,
      collection_id: dashboard.collectionId,
      name: dashboard.title,
      description: dashboard.description,
      expected_revision: dashboard.revision,
      tabs: dashboard.tabs,
      cards: dashboard.cards.map((card) => {
        const base = {
          id: card.id,
          tab_id: card.tabId,
          kind: card.kind,
          geometry: card.geometry,
        };
        if (card.kind === 'CHART') {
          return {
            ...base,
            chart_id: card.chartId,
            chart_revision_number: card.chartRevisionNumber,
            visualization_overrides: card.visualizationOverrides,
          };
        }
        return { ...base, content: card.content };
      }),
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
      created_by_identity_id: dashboard.createdByIdentityId,
      archived_at: dashboard.archivedAt,
      created_at: dashboard.createdAt,
      updated_at: dashboard.updatedAt,
    });
  }
}

export class DashboardExecutionResponse {
  @ApiProperty() public readonly dashboard_id!: string;
  @ApiProperty() public readonly tab_id!: string;
  @ApiProperty({ type: 'array' }) public readonly cards!: readonly object[];

  public static from(execution: DashboardExecution): DashboardExecutionResponse {
    return Object.assign(new DashboardExecutionResponse(), {
      dashboard_id: execution.dashboardId,
      tab_id: execution.tabId,
      cards: execution.cards.map((card) => ({
        card_id: card.cardId,
        state: card.state,
        ...('result' in card ? { result: card.result } : {}),
        ...('message' in card ? { message: card.message } : {}),
      })),
    });
  }
}

export class DashboardFilterTargetsResponse {
  @ApiProperty({ type: 'array' }) public readonly cards!: readonly object[];

  public static from(cards: readonly DashboardCardFilterTargets[]): DashboardFilterTargetsResponse {
    return Object.assign(new DashboardFilterTargetsResponse(), {
      cards: cards.map((card) => ({
        card_id: card.cardId,
        targets: card.targets.map((target) => ({
          kind: target.kind,
          semantic_type: target.semanticType,
          ...(target.kind === 'FIELD' ? { field_id: target.fieldId } : {}),
          ...(target.kind === 'NATIVE_QUERY_VARIABLE' ? { variable_key: target.variableKey } : {}),
          ...(target.kind === 'CONTENT_VARIABLE' ? { variable_name: target.variableName } : {}),
        })),
      })),
    });
  }
}
