import { InputParseError } from '@/src/entities/errors/application-errors';
import type { DeleteChartUseCase } from '@/src/application/use-cases/charts/delete-chart.use-case';

import { deleteChartInputSchema } from './chart.schemas';

export type DeleteChartController = ReturnType<typeof createDeleteChartController>;

export const createDeleteChartController =
  (useCase: DeleteChartUseCase) =>
  async (input: unknown): Promise<void> => {
    const parsed = deleteChartInputSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid chart deletion', { cause: parsed.error });
    await useCase(parsed.data);
  };
