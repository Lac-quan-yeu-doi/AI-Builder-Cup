import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartDraft, ChartPreview } from '@/src/entities/models/canonical-chart';

export interface PreviewCanonicalChartQueryInput {
  readonly queryDefinition: ChartDraft['queryDefinition'];
  readonly parameterValues: ChartDraft['parameterValues'];
}

export type PreviewCanonicalChartQueryUseCase = (
  input: PreviewCanonicalChartQueryInput,
) => Promise<ChartPreview>;

export const createPreviewCanonicalChartQueryUseCase =
  (repository: CanonicalChartRepository): PreviewCanonicalChartQueryUseCase =>
  (input) =>
    repository.previewQuery(input);
