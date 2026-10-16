import type {
  ChartEncodingSuggestion,
  ChartEncodingSuggestionInput,
} from '@/src/entities/models/chart-encoding-suggestion';

export interface ChartEncodingSuggestionRepository {
  suggest(input: ChartEncodingSuggestionInput): Promise<ChartEncodingSuggestion>;
}
