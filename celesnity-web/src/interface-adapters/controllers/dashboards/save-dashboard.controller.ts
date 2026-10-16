import type { SaveDashboardUseCase } from '@/src/application/use-cases/dashboards/save-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDashboard } from '@/src/interface-adapters/presenters/dashboard.presenter';
import { dashboardSchema } from './dashboard.schemas';

export const createSaveDashboardController =
  (useCase: SaveDashboardUseCase) => async (input: unknown) => {
    const parsed = dashboardSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard draft.', { cause: parsed.error });
    return presentDashboard(await useCase(parsed.data));
  };
export type SaveDashboardController = ReturnType<typeof createSaveDashboardController>;
