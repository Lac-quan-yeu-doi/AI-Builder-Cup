import type { GetDashboardUseCase } from '@/src/application/use-cases/dashboards/get-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDashboard } from '@/src/interface-adapters/presenters/dashboard.presenter';
import { dashboardIdSchema } from './dashboard.schemas';

export const createGetDashboardController =
  (useCase: GetDashboardUseCase) => async (input: unknown) => {
    const parsed = dashboardIdSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard identifier.', { cause: parsed.error });
    return presentDashboard(await useCase(parsed.data));
  };
export type GetDashboardController = ReturnType<typeof createGetDashboardController>;
