import type { CopyDashboardUseCase } from '@/src/application/use-cases/dashboards/copy-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { presentDashboard } from '@/src/interface-adapters/presenters/dashboard.presenter';
import { copyDashboardSchema } from './dashboard.schemas';

export const createCopyDashboardController =
  (useCase: CopyDashboardUseCase) => async (input: unknown) => {
    const parsed = copyDashboardSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard copy request.', { cause: parsed.error });
    return presentDashboard(await useCase(parsed.data));
  };
export type CopyDashboardController = ReturnType<typeof createCopyDashboardController>;
