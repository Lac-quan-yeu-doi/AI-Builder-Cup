import type { DashboardPrincipal } from '@application/dashboard/interfaces/i-dashboard-collection-authorization.reader';
import type { IDashboardChartReader } from '@application/dashboard/interfaces/i-dashboard-chart.reader';
import type { Dashboard } from '@domain/dashboard/models/dashboard';

export async function requireDashboardCharts(
  dashboard: Dashboard,
  principal: DashboardPrincipal,
  charts: IDashboardChartReader,
): Promise<void> {
  for (const card of dashboard.cards) {
    if (card.kind !== 'CHART') continue;
    await charts.requireViewableChart({
      chartId: card.chartId,
      revisionNumber: card.chartRevisionNumber,
      principal,
    });
  }
}
