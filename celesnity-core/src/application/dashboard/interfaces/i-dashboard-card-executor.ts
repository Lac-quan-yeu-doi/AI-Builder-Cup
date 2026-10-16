import type { DashboardFilterApplication } from '@application/dashboard/dashboard-execution.models';
import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';

export type DashboardCardExecutorResult =
  | { readonly state: 'SUCCESS'; readonly result: unknown }
  | { readonly state: 'RESTRICTED' | 'TIMEOUT' | 'ERROR'; readonly message: string };

export interface IDashboardCardExecutor {
  execute(input: {
    readonly principal: DashboardPrincipal;
    readonly chartId: string;
    readonly revisionNumber: number | null;
    readonly filters: readonly DashboardFilterApplication[];
  }): Promise<DashboardCardExecutorResult>;
}
