import type { PreviewCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart-query.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { QueryDefinition } from '@/src/entities/models/canonical-chart';
import {
  presentChartPreview,
  type ChartPreviewViewModel,
} from '@/src/interface-adapters/presenters/canonical-chart.presenter';

import { previewCanonicalChartQuerySchema } from './canonical-chart.schemas';

export type PreviewCanonicalChartQueryController = ReturnType<
  typeof createPreviewCanonicalChartQueryController
>;

export const createPreviewCanonicalChartQueryController =
  (useCase: PreviewCanonicalChartQueryUseCase) =>
  async (input: unknown): Promise<ChartPreviewViewModel> => {
    const parsed = previewCanonicalChartQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new InputParseError('Invalid chart query preview.', { cause: parsed.error });
    }
    return presentChartPreview(
      await useCase({
        queryDefinition: parsed.data.queryDefinition as unknown as QueryDefinition,
        parameterValues: parsed.data.parameterValues,
      }),
    );
  };
