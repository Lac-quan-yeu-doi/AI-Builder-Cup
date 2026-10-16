import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CreateChartUseCase } from '@/src/application/use-cases/charts/create-chart.use-case';
import {
  presentChart,
  type ChartViewModel,
} from '@/src/interface-adapters/presenters/chart.presenter';

import { createChartInputSchema } from './chart.schemas';

export type CreateChartController = ReturnType<typeof createCreateChartController>;

export const createCreateChartController =
  (useCase: CreateChartUseCase) =>
  async (input: unknown): Promise<ChartViewModel> => {
    const parsed = createChartInputSchema.safeParse(input);
    if (!parsed.success) throw new InputParseError('Invalid chart input', { cause: parsed.error });
    return presentChart(await useCase(parsed.data));
  };
