import { InputParseError } from '@/src/entities/errors/application-errors';
import type { PatchChartUseCase } from '@/src/application/use-cases/charts/patch-chart.use-case';
import {
  presentChart,
  type ChartViewModel,
} from '@/src/interface-adapters/presenters/chart.presenter';

import { patchChartInputSchema } from './chart.schemas';

export type PatchChartController = ReturnType<typeof createPatchChartController>;

export const createPatchChartController =
  (useCase: PatchChartUseCase) =>
  async (input: unknown): Promise<ChartViewModel> => {
    const parsed = patchChartInputSchema.safeParse(input);
    if (!parsed.success) throw new InputParseError('Invalid chart update', { cause: parsed.error });
    return presentChart(await useCase(parsed.data));
  };
