import type { OutputColumn, ParameterValue } from '@/src/entities/models/canonical-chart';
import type {
  DashboardFilterTarget,
  DashboardFilterSemanticType,
} from '@/src/entities/models/dashboard';

export interface DashboardChartRuntimeResult {
  readonly runId: string;
  readonly columns: readonly OutputColumn[];
  readonly rows: readonly (readonly ParameterValue[])[];
  readonly rowCount: number;
}

export type DashboardRuntimeCard =
  | { readonly cardId: string; readonly state: 'UNCHANGED' | 'REQUIRES_FILTER' }
  | {
      readonly cardId: string;
      readonly state: 'SUCCESS';
      readonly result: DashboardChartRuntimeResult;
    }
  | {
      readonly cardId: string;
      readonly state: 'ERROR' | 'RESTRICTED' | 'TIMEOUT';
      readonly message: string;
    };

export interface DashboardRuntimeResult {
  readonly dashboardId: string;
  readonly tabId: string;
  readonly cards: readonly DashboardRuntimeCard[];
}

export interface DashboardFilterTargetOption {
  readonly cardId: string;
  readonly targets: readonly (DashboardFilterTarget & {
    readonly semanticType: DashboardFilterSemanticType;
  })[];
}
