import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import type {
  ChartDraft,
  CompiledChartQuery,
  QueryDefinition,
} from '@/src/entities/models/canonical-chart';

export interface CompileCanonicalChartQueryInput {
  readonly queryDefinition: QueryDefinition;
  readonly parameterValues: ChartDraft['parameterValues'];
}

export type CompileCanonicalChartQueryUseCase = (
  input: CompileCanonicalChartQueryInput,
) => Promise<CompiledChartQuery>;

export const createCompileCanonicalChartQueryUseCase =
  (repository: CanonicalChartRepository): CompileCanonicalChartQueryUseCase =>
  (input) =>
    repository.compileQuery(input);
