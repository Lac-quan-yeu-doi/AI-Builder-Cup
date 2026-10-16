import type {
  DashboardFilterTargetOption,
  DashboardRuntimeResult,
} from '@/src/entities/models/dashboard-runtime';

export interface DashboardRuntimeService {
  execute(input: {
    readonly dashboardId: string;
    readonly tabId: string;
    readonly values: Readonly<Record<string, unknown>>;
    readonly changedFilterIds?: readonly string[];
  }): Promise<DashboardRuntimeResult>;
  listFilterTargets(input: {
    readonly dashboardId: string;
    readonly chartCards?: readonly { readonly cardId: string; readonly chartId: string }[];
  }): Promise<readonly DashboardFilterTargetOption[]>;
}
