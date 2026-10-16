import type { DashboardRuntimeService } from '@/src/application/services/dashboard-runtime.service.interface';
import type {
  DashboardChartRuntimeResult,
  DashboardFilterTargetOption,
  DashboardRuntimeResult,
} from '@/src/entities/models/dashboard-runtime';
import type { DashboardFilterTarget } from '@/src/entities/models/dashboard';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { translateCoreApiError } from '@/src/infrastructure/api/translate-core-api-error';

interface ExecutionDto {
  readonly dashboard_id: string;
  readonly tab_id: string;
  readonly cards: readonly {
    readonly card_id: string;
    readonly state: string;
    readonly result?: DashboardChartRuntimeResult;
    readonly message?: string;
  }[];
}

interface TargetsDto {
  readonly cards: readonly {
    readonly card_id: string;
    readonly targets: readonly {
      readonly kind: string;
      readonly semantic_type: DashboardFilterTargetOption['targets'][number]['semanticType'];
      readonly field_id?: string;
      readonly variable_key?: string;
      readonly variable_name?: string;
    }[];
  }[];
}

export class CoreApiDashboardRuntimeService implements DashboardRuntimeService {
  public constructor(private readonly transport: GeneratedApiTransport) {}

  public async execute(
    input: Parameters<DashboardRuntimeService['execute']>[0],
  ): Promise<DashboardRuntimeResult> {
    const dto = await this.request<ExecutionDto>(
      `/dashboards/${encodeURIComponent(input.dashboardId)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({
          tab_id: input.tabId,
          values: input.values,
          changed_filter_ids: input.changedFilterIds,
        }),
      },
    );
    return {
      dashboardId: dto.dashboard_id,
      tabId: dto.tab_id,
      cards: dto.cards.map((card) => {
        if (card.state === 'SUCCESS' && card.result)
          return { cardId: card.card_id, state: 'SUCCESS', result: card.result };
        if (card.state === 'UNCHANGED' || card.state === 'REQUIRES_FILTER')
          return { cardId: card.card_id, state: card.state };
        return {
          cardId: card.card_id,
          state: isFailureState(card.state) ? card.state : 'ERROR',
          message: card.message ?? 'The dashboard card could not be loaded.',
        };
      }),
    };
  }

  public async listFilterTargets(
    input: Parameters<DashboardRuntimeService['listFilterTargets']>[0],
  ): Promise<readonly DashboardFilterTargetOption[]> {
    const dto = await this.request<TargetsDto>(
      `/dashboards/${encodeURIComponent(input.dashboardId)}/filter-targets${input.chartCards ? '/preview' : ''}`,
      input.chartCards
        ? {
            method: 'POST',
            body: JSON.stringify({
              cards: input.chartCards.map((card) => ({
                card_id: card.cardId,
                chart_id: card.chartId,
              })),
            }),
          }
        : undefined,
    );
    return dto.cards.map((card) => ({
      cardId: card.card_id,
      targets: card.targets.map(mapTarget),
    }));
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      return await this.transport.request<T>(path, init);
    } catch (error) {
      throw translateCoreApiError(error);
    }
  }
}

function isFailureState(value: string): value is 'ERROR' | 'RESTRICTED' | 'TIMEOUT' {
  return value === 'ERROR' || value === 'RESTRICTED' || value === 'TIMEOUT';
}

function mapTarget(dto: TargetsDto['cards'][number]['targets'][number]): DashboardFilterTarget & {
  readonly semanticType: DashboardFilterTargetOption['targets'][number]['semanticType'];
} {
  const semanticType = dto.semantic_type;
  if (dto.kind === 'FIELD') return { kind: 'FIELD', fieldId: dto.field_id ?? '', semanticType };
  if (dto.kind === 'NATIVE_QUERY_VARIABLE')
    return { kind: 'NATIVE_QUERY_VARIABLE', variableKey: dto.variable_key ?? '', semanticType };
  return { kind: 'CONTENT_VARIABLE', variableName: dto.variable_name ?? '', semanticType };
}
