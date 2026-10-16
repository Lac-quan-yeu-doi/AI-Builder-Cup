import { describe, expect, it } from 'vitest';

import {
  chartBuilderReducer,
  createInitialChartBuilderState,
} from '@/app/(workspace)/charts/_components/chart-builder-state';
import type { NativeQueryDefinition } from '@/src/entities/models/canonical-chart';

describe('chartBuilderReducer canonical draft', () => {
  it('switches from visual to native through a query definition and invalidates the preview', () => {
    const initial = createInitialChartBuilderState();
    const state = chartBuilderReducer(initial, {
      type: 'QUERY_CHANGED',
      query: {
        schemaVersion: 1,
        mode: 'NATIVE',
        context: initial.draft.queryDefinition.context,
        parameters: [],
        sql: 'SELECT 1',
      },
    });

    expect(state.draft.queryDefinition.mode).toBe('NATIVE');
    expect(state.previewStatus).toBe('STALE');
  });

  it('converts to native while preserving chart metadata and invalidating the preview', () => {
    const initial = createInitialChartBuilderState();
    const nativeQuery: NativeQueryDefinition = {
      schemaVersion: 1,
      mode: 'NATIVE',
      context: initial.draft.queryDefinition.context,
      parameters: [],
      sql: 'SELECT 1',
    };
    const previewedState = {
      ...initial,
      previewStatus: 'SUCCEEDED' as const,
      preview: {
        columns: [{ name: 'value', type: 'NUMBER', family: 'NUMBER' as const }],
        rows: [[1]],
        rowCount: 1,
        byteCount: 8,
        truncated: false,
      },
      dirty: false,
    };

    const converted = chartBuilderReducer(previewedState, {
      type: 'QUERY_CONVERTED_TO_NATIVE',
      query: nativeQuery,
    });

    expect(converted.draft.queryDefinition).toEqual(nativeQuery);
    expect(converted.draft.visualizationDefinition).toEqual(
      previewedState.draft.visualizationDefinition,
    );
    expect(converted.preview?.rows).toEqual([[1]]);
    expect(converted.previewStatus).toBe('STALE');
    expect(converted.dirty).toBe(true);
  });
});
