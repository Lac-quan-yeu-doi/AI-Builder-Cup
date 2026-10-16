import type { DashboardRepository } from '@/src/application/repositories/dashboard.repository.interface';
import type { DashboardSummary } from '@/src/entities/models/dashboard';

export type ListDashboardsUseCase = (collectionId: string) => Promise<readonly DashboardSummary[]>;
export const createListDashboardsUseCase =
  (repository: DashboardRepository): ListDashboardsUseCase =>
  (collectionId) =>
    repository.list(collectionId);
