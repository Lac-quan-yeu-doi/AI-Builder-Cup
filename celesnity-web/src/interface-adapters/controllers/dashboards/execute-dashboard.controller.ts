import { z } from 'zod';

import type { ExecuteDashboardUseCase } from '@/src/application/use-cases/dashboards/execute-dashboard.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';

const schema = z.object({
  dashboardId: z.string().trim().min(1),
  tabId: z.string().trim().min(1),
  values: z.record(z.string(), z.unknown()),
  changedFilterIds: z.array(z.string().trim().min(1)).optional(),
});

export const createExecuteDashboardController =
  (useCase: ExecuteDashboardUseCase) => async (input: unknown) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid dashboard execution request.', { cause: parsed.error });
    return useCase(parsed.data);
  };
export type ExecuteDashboardController = ReturnType<typeof createExecuteDashboardController>;
