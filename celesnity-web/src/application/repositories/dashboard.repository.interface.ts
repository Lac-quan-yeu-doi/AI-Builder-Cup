import type { Dashboard, DashboardSummary } from '@/src/entities/models/dashboard';

export interface CreateDashboardInput {
  readonly collectionId: string;
  readonly name: string;
  readonly description: string | null;
}

export interface CopyDashboardInput {
  readonly sourceDashboardId: string;
  readonly collectionId: string;
  readonly name: string;
  readonly draft: Dashboard;
}

export interface DashboardRepository {
  create(input: CreateDashboardInput): Promise<Dashboard>;
  list(collectionId: string): Promise<readonly DashboardSummary[]>;
  get(dashboardId: string): Promise<Dashboard>;
  save(dashboard: Dashboard): Promise<Dashboard>;
  copy(input: CopyDashboardInput): Promise<Dashboard>;
  archive(dashboardId: string): Promise<void>;
}
