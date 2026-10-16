import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';
import type { Dashboard } from '@/src/entities/models/dashboard';

export type GetDashboardUseCase = (dashboardId: string) => Promise<Dashboard>;
export const createGetDashboardUseCase =
  (repository: DashboardRepository): GetDashboardUseCase =>
  (dashboardId) =>
    repository.get(dashboardId);
