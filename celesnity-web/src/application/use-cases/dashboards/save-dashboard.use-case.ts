import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';
import type { Dashboard } from '@/src/entities/models/dashboard';

export type SaveDashboardUseCase = (dashboard: Dashboard) => Promise<Dashboard>;
export const createSaveDashboardUseCase =
  (repository: DashboardRepository): SaveDashboardUseCase =>
  (dashboard) =>
    repository.save(dashboard);
