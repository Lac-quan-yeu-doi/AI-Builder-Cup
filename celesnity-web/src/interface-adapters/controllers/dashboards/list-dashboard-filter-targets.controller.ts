import type { ListDashboardFilterTargetsUseCase } from '@/src/application/use-cases/dashboards/list-dashboard-filter-targets.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { listDashboardFilterTargetsSchema } from './dashboard.schemas';

export const createListDashboardFilterTargetsController =
  (useCase: ListDashboardFilterTargetsUseCase) => async (input: unknown) => {
    const parsed = listDashboardFilterTargetsSchema.safeParse(
      typeof input === 'string' ? { dashboardId: input } : input,
    );
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard identifier.', { cause: parsed.error });
    return useCase(parsed.data);
  };
export type ListDashboardFilterTargetsController = ReturnType<
  typeof createListDashboardFilterTargetsController
>;
