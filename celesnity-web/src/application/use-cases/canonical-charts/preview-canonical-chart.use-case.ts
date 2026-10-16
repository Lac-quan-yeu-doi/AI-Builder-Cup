import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { ChartDraft, ChartPreview } from '@/src/entities/models/canonical-chart';

export type PreviewCanonicalChartUseCase = (input: ChartDraft) => Promise<ChartPreview>;

export const createPreviewCanonicalChartUseCase =
  (repository: CanonicalChartRepository): PreviewCanonicalChartUseCase =>
  (input) => {
    const title = input.title.trim();
    if (!title) throw new Error('Chart title is required.');
    return repository.preview({ ...input, title });
  };
