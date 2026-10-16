import type { CreateDashboardUseCase } from '@/src/application/use-cases/dashboards/create-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDashboard } from '@/src/interface-adapters/presenters/dashboard.presenter';
import { createDashboardSchema } from './dashboard.schemas';

export const createCreateDashboardController =
  (useCase: CreateDashboardUseCase) => async (input: unknown) => {
    const parsed = createDashboardSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard create request.', { cause: parsed.error });
    return presentDashboard(await useCase(parsed.data));
  };
export type CreateDashboardController = ReturnType<typeof createCreateDashboardController>;
