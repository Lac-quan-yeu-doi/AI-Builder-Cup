import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { CreateCanonicalChartInput } from '@/src/entities/models/canonical-chart';

export type SaveAsNewCanonicalChartUseCase = ReturnType<
  typeof createSaveAsNewCanonicalChartUseCase
>;

export const createSaveAsNewCanonicalChartUseCase =
  (repository: CanonicalChartRepository) =>
  async (
    input: CreateCanonicalChartInput,
  ): Promise<Awaited<ReturnType<typeof repository.create>>> => {
    if (!input.title.trim() || !input.collectionId.trim()) {
      throw new Error('Chart title and destination collection are required.');
    }
    return repository.saveAsNew ? repository.saveAsNew(input) : repository.create(input);
  };
