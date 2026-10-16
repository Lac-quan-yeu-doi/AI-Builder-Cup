import type { DashboardRuntimeService } from '@/src/application/services/dashboard-runtime.service.interface';
import type { DashboardFilterTargetOption } from '@/src/entities/models/dashboard-runtime';

export interface ListDashboardFilterTargetsInput {
  readonly dashboardId: string;
  readonly chartCards?: readonly { readonly cardId: string; readonly chartId: string }[];
}

export type ListDashboardFilterTargetsUseCase = (
  input: ListDashboardFilterTargetsInput,
) => Promise<readonly DashboardFilterTargetOption[]>;
export const createListDashboardFilterTargetsUseCase =
  (service: DashboardRuntimeService): ListDashboardFilterTargetsUseCase =>
  (input) =>
    service.listFilterTargets(input);
