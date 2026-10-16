import type {
  CopyDashboardInput,
  DashboardRepository,
} from '@/src/application/repositories/dashboard.repository.interface';
import type { Dashboard } from '@/src/entities/models/dashboard';

export type CopyDashboardUseCase = (input: CopyDashboardInput) => Promise<Dashboard>;
export const createCopyDashboardUseCase =
  (repository: DashboardRepository): CopyDashboardUseCase =>
  (input) =>
    repository.copy(input);
