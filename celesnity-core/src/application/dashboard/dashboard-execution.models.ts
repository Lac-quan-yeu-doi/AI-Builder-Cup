import type { DashboardFilterTarget } from '@domain/dashboard/models/dashboard-filter';

export interface DashboardFilterApplication {
  readonly filterId: string;
  readonly operator: string;
  readonly target: DashboardFilterTarget;
  readonly value: unknown;
}

export type DashboardCardExecution =
  | { readonly cardId: string; readonly state: 'UNCHANGED' | 'REQUIRES_FILTER' }
  | { readonly cardId: string; readonly state: 'SUCCESS'; readonly result: unknown }
  | {
      readonly cardId: string;
      readonly state: 'ERROR' | 'RESTRICTED' | 'TIMEOUT';
      readonly message: string;
    };

export interface DashboardExecution {
  readonly dashboardId: string;
  readonly tabId: string;
  readonly cards: readonly DashboardCardExecution[];
}
