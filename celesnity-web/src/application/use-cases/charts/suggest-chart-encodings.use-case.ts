import type { ChartEncodingSuggestionRepository } from '@/src/application/repositories/chart-encoding-suggestion.repository.interface';
import type {
  ChartEncodingSuggestion,
  ChartEncodingSuggestionInput,
} from '@/src/entities/models/chart-encoding-suggestion';

export type SuggestChartEncodingsUseCase = (
  input: ChartEncodingSuggestionInput,
) => Promise<ChartEncodingSuggestion>;

export const createSuggestChartEncodingsUseCase =
  (repository: ChartEncodingSuggestionRepository): SuggestChartEncodingsUseCase =>
  (input: ChartEncodingSuggestionInput): Promise<ChartEncodingSuggestion> => {
    return repository.suggest(input);
  };
