import type { CreateCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/create-canonical-chart.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { CreateCanonicalChartInput } from '@/src/entities/models/canonical-chart';
import {
  presentCanonicalChart,
  type CanonicalChartViewModel,
} from '@/src/interface-adapters/presenters/canonical-chart.presenter';

import { createCanonicalChartSchema } from './canonical-chart.schemas';

export type CreateCanonicalChartController = ReturnType<
  typeof createCreateCanonicalChartController
>;

export const createCreateCanonicalChartController =
  (useCase: CreateCanonicalChartUseCase) =>
  async (input: unknown): Promise<CanonicalChartViewModel> => {
    const parsed = createCanonicalChartSchema.safeParse(input);
    if (!parsed.success)
      throw new InputParseError('Invalid chart create request.', { cause: parsed.error });
    return presentCanonicalChart(
      await useCase(parsed.data as unknown as CreateCanonicalChartInput),
    );
  };
