import type {
  CreateDashboardInput,
  DashboardRepository,
} from '@/src/application/repositories/dashboard.repository.interface';
import type { Dashboard } from '@/src/entities/models/dashboard';

export type CreateDashboardUseCase = (input: CreateDashboardInput) => Promise<Dashboard>;

export const createCreateDashboardUseCase =
  (repository: DashboardRepository): CreateDashboardUseCase =>
  (input) =>
    repository.create(input);
