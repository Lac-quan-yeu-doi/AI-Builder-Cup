import type { ArchiveDashboardUseCase } from '@/src/application/use-cases/dashboards/archive-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import { dashboardIdSchema } from './dashboard.schemas';

export const createArchiveDashboardController =
  (useCase: ArchiveDashboardUseCase) => async (input: unknown) => {
    const parsed = dashboardIdSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard identifier.', { cause: parsed.error });
    await useCase(parsed.data);
  };
export type ArchiveDashboardController = ReturnType<typeof createArchiveDashboardController>;
