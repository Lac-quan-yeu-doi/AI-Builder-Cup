import type { ListDashboardsUseCase } from '@/src/application/use-cases/dashboards/list-dashboards.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDashboardSummary } from '@/src/interface-adapters/presenters/dashboard.presenter';
import { dashboardIdSchema } from './dashboard.schemas';

export const createListDashboardsController =
  (useCase: ListDashboardsUseCase) => async (input: unknown) => {
    const parsed = dashboardIdSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid collection identifier.', { cause: parsed.error });
    return (await useCase(parsed.data)).map(presentDashboardSummary);
  };
export type ListDashboardsController = ReturnType<typeof createListDashboardsController>;
