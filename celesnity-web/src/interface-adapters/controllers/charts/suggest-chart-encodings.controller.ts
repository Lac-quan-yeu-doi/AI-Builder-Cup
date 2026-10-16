import { InputParseError } from '@/src/entities/errors/application-errors';
import type { SuggestChartEncodingsUseCase } from '@/src/application/use-cases/charts/suggest-chart-encodings.use-case';
import type { ChartEncodingSuggestion } from '@/src/entities/models/chart-encoding-suggestion';

import { suggestChartEncodingsInputSchema } from './chart.schemas';

export type SuggestChartEncodingsController = ReturnType<
  typeof createSuggestChartEncodingsController
>;

export const createSuggestChartEncodingsController =
  (useCase: SuggestChartEncodingsUseCase) =>
  async (input: unknown): Promise<ChartEncodingSuggestion> => {
    const parsed = suggestChartEncodingsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid chart encoding suggestion request', {
        cause: parsed.error,
      });
    }
    return useCase(parsed.data);
  };
