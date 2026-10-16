import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';

export type ArchiveDashboardUseCase = (dashboardId: string) => Promise<void>;
export const createArchiveDashboardUseCase =
  (repository: DashboardRepository): ArchiveDashboardUseCase =>
  (dashboardId) =>
    repository.archive(dashboardId);
