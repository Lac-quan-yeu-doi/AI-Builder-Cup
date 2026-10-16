import type { Dashboard, DashboardSummary } from '@/src/entities/models/dashboard';

export type DashboardViewModel = Readonly<Dashboard>;
export type DashboardSummaryViewModel = Readonly<DashboardSummary>;

export function presentDashboard(dashboard: Dashboard): DashboardViewModel {
  const copy = structuredClone(dashboard);
  Object.freeze(copy.tabs);
  Object.freeze(copy.cards);
  Object.freeze(copy.filters);
  Object.freeze(copy.mappings);
  return Object.freeze(copy);
}

export function presentDashboardSummary(summary: DashboardSummary): DashboardSummaryViewModel {
  return Object.freeze({ ...summary });
}
