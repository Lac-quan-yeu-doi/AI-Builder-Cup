import type { ChartEncodings, ChartType } from './chart';

export interface ChartEncodingSuggestionInput {
  readonly userId: string;
  readonly title: string;
  readonly chartType: ChartType;
  readonly columns: readonly string[];
  readonly sampleRows: readonly Record<string, unknown>[];
}

export interface ChartEncodingSuggestion {
  readonly chartType: ChartType;
  readonly encodings: ChartEncodings;
}
