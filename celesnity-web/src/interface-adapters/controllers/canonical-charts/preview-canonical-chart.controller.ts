import type { PreviewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart.use-case';
import { InputParseError } from '@/src/entities/errors/application-errors';
import type { ChartDraft } from '@/src/entities/models/canonical-chart';
import {
  presentChartPreview,
  type ChartPreviewViewModel,
} from '@/src/interface-adapters/presenters/canonical-chart.presenter';

import { chartDraftSchema } from './canonical-chart.schemas';

export type PreviewCanonicalChartController = ReturnType<
  typeof createPreviewCanonicalChartController
>;

export const createPreviewCanonicalChartController =
  (useCase: PreviewCanonicalChartUseCase) =>
  async (input: unknown): Promise<ChartPreviewViewModel> => {
    const parsed = chartDraftSchema.safeParse(input);
    if (!parsed.success) throw new InputParseError('Invalid chart draft.', { cause: parsed.error });
    return presentChartPreview(await useCase(parsed.data as unknown as ChartDraft));
  };
