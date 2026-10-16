import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';

export interface IDashboardChartReader {
  requireViewableChart(input: {
    readonly chartId: string;
    readonly revisionNumber: number | null;
    readonly principal: DashboardPrincipal;
  }): Promise<void>;
}
