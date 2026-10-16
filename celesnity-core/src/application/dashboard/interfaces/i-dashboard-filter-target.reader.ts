import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { DashboardFilterTargetMetadata } from '@domain/dashboard/services/dashboard-filter-compatibility';

export interface DashboardCardFilterTargets {
  readonly cardId: string;
  readonly targets: readonly DashboardFilterTargetMetadata[];
}

export interface IDashboardFilterTargetReader {
  list(input: {
    readonly principal: DashboardPrincipal;
    readonly cards: readonly { readonly cardId: string; readonly chartId: string }[];
  }): Promise<readonly DashboardCardFilterTargets[]>;
}
