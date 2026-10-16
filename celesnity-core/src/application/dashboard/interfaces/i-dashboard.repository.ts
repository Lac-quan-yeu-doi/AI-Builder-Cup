import type { Dashboard } from '@domain/dashboard/models/dashboard';

export interface DashboardSummary {
  readonly id: string;
  readonly collectionId: string;
  readonly title: string;
  readonly description: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface SaveDashboardRecord {
  readonly dashboard: Dashboard;
  readonly expectedRevision: number;
}

export interface ArchiveDashboardRecord {
  readonly organizationId: string;
  readonly dashboardId: string;
  readonly archivedAt: string;
}

export interface IDashboardRepository {
  create(dashboard: Dashboard): Promise<Dashboard>;
  findById(organizationId: string, dashboardId: string): Promise<Dashboard | null>;
  listByCollection(
    organizationId: string,
    collectionId: string,
  ): Promise<readonly DashboardSummary[]>;
  saveCompleteDraft(input: SaveDashboardRecord): Promise<Dashboard | null>;
  copy(dashboard: Dashboard): Promise<Dashboard>;
  archive(input: ArchiveDashboardRecord): Promise<void>;
}
