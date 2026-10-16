import type { DashboardRuntimeService } from '@/src/application/services/dashboard-runtime.service.interface';
import type { DashboardRuntimeResult } from '@/src/entities/models/dashboard-runtime';

export type ExecuteDashboardInput = Parameters<DashboardRuntimeService['execute']>[0];
export type ExecuteDashboardUseCase = (
  input: ExecuteDashboardInput,
) => Promise<DashboardRuntimeResult>;
export const createExecuteDashboardUseCase =
  (service: DashboardRuntimeService): ExecuteDashboardUseCase =>
  (input) =>
    service.execute(input);
