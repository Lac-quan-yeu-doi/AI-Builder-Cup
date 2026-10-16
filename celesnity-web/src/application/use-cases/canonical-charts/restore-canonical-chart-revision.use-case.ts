import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type { CanonicalChart } from '@/src/entities/models/canonical-chart';

export interface RestoreCanonicalChartRevisionInput {
  readonly chartId: string;
  readonly revisionNumber: number;
  readonly expectedRevision: number;
}

export type RestoreCanonicalChartRevisionUseCase = (
  input: RestoreCanonicalChartRevisionInput,
) => Promise<CanonicalChart>;

export const createRestoreCanonicalChartRevisionUseCase =
  (repository: CanonicalChartRepository): RestoreCanonicalChartRevisionUseCase =>
  (input) => {
    const chartId = input.chartId.trim();
    if (!chartId) throw new Error('Chart id is required.');
    if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) {
      throw new Error('Revision number must be a positive integer.');
    }
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new Error('Expected revision must be a positive integer.');
    }
    if (input.revisionNumber === input.expectedRevision) {
      throw new Error('The current chart version cannot be restored.');
    }
    if (!repository.restoreRevision) throw new Error('Chart restoration is unavailable.');
    return repository.restoreRevision({ ...input, chartId });
  };
