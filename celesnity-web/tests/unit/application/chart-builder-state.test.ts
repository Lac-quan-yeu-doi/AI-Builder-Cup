import { describe, expect, it } from 'vitest';

import {
  chartBuilderReducer,
  createInitialChartBuilderState,
} from '@/app/(workspace)/charts/_components/chart-builder-state';
import type { NativeQueryDefinition } from '@/src/entities/models/canonical-chart';

const nativeQuery: NativeQueryDefinition = {
  schemaVersion: 1,
  mode: 'NATIVE',
  context: { catalog: 'iceberg', schema: 'analytics' },
  sql: 'SELECT region, revenue FROM orders',
  parameters: [],
};

describe('chartBuilderReducer', () => {
  it('creates a native draft when SQL is the selected entry workflow', () => {
    const initial = createInitialChartBuilderState('', 'iceberg', 'analytics', undefined, 'NATIVE');

    expect(initial.draft.queryDefinition).toEqual({
      schemaVersion: 1,
      mode: 'NATIVE',
      context: { catalog: 'iceberg', schema: 'analytics' },
      parameters: [],
      sql: '',
    });
  });

  it('marks a successful preview stale while retaining the last transient rows when the query changes', () => {
    const previewed = {
      ...createInitialChartBuilderState(),
      previewStatus: 'SUCCEEDED' as const,
      preview: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' as const }],
        rows: [['west']],
        rowCount: 1,
        byteCount: 12,
        truncated: false,
      },
    };

    const next = chartBuilderReducer(previewed, { type: 'QUERY_CHANGED', query: nativeQuery });

    expect(next).toMatchObject({
      draft: { queryDefinition: nativeQuery },
      preview: { rows: [['west']] },
      previewStatus: 'STALE',
      dirty: true,
    });
  });

  it('marks the preview stale when the visualization changes', () => {
    const previewed = {
      ...createInitialChartBuilderState(),
      previewStatus: 'SUCCEEDED' as const,
    };

    const next = chartBuilderReducer(previewed, {
      type: 'VISUALIZATION_CHANGED',
      visualization: {
        schemaVersion: 1,
        type: 'PIE',
        roles: { measure: 'revenue', breakout: 'region' },
        display: { showLegend: true, showLabels: true, percentagePlacement: 'ON_CHART' },
      },
    });

    expect(next).toMatchObject({
      previewStatus: 'STALE',
      dirty: true,
    });
  });

  it('keeps successful rows stale after refresh failure', () => {
    const previewed = {
      ...createInitialChartBuilderState(),
      previewStatus: 'SUCCEEDED' as const,
      preview: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' as const }],
        rows: [['west']],
        rowCount: 1,
        byteCount: 12,
        truncated: false,
      },
      dirty: false,
    };

    const running = chartBuilderReducer(previewed, {
      type: 'PREVIEW_STARTED',
      requestId: 7,
    });
    const failed = chartBuilderReducer(running, {
      type: 'PREVIEW_FAILED',
      requestId: 7,
      message: 'Timed out',
    });

    expect(failed.preview?.rows).toEqual(previewed.preview?.rows);
    expect(failed.previewStatus).toBe('STALE');
    expect(failed.dirty).toBe(true);
    expect(failed.error).toBe('Timed out');
  });

  it('ignores a preview result that does not belong to the active request', () => {
    const initial = createInitialChartBuilderState();
    const first = chartBuilderReducer(initial, { type: 'PREVIEW_STARTED', requestId: 1 });
    const second = chartBuilderReducer(first, { type: 'PREVIEW_STARTED', requestId: 2 });
    const staleResponse = chartBuilderReducer(second, {
      type: 'PREVIEW_SUCCEEDED',
      requestId: 1,
      result: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' }],
        rows: [['wrong']],
        rowCount: 1,
        byteCount: 8,
        truncated: false,
      },
    });

    expect(staleResponse).toBe(second);
    expect(staleResponse.preview).toBeNull();
    expect(staleResponse.previewStatus).toBe('RUNNING');
  });

  it('invalidates an in-flight preview when the query changes', () => {
    const running = chartBuilderReducer(createInitialChartBuilderState(), {
      type: 'PREVIEW_STARTED',
      requestId: 1,
    });
    const changed = chartBuilderReducer(running, { type: 'QUERY_CHANGED', query: nativeQuery });
    const lateResponse = chartBuilderReducer(changed, {
      type: 'PREVIEW_SUCCEEDED',
      requestId: 1,
      result: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' }],
        rows: [['wrong']],
        rowCount: 1,
        byteCount: 8,
        truncated: false,
      },
    });

    expect(lateResponse).toBe(changed);
    expect(lateResponse.preview).toBeNull();
    expect(lateResponse.previewStatus).toBe('STALE');
  });

  it('keeps full-preview rows when a step preview succeeds for the unchanged query', () => {
    const initial = {
      ...createInitialChartBuilderState(),
      previewStatus: 'SUCCEEDED' as const,
      previewScope: { kind: 'FULL' as const },
      preview: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' as const }],
        rows: [['west']],
        rowCount: 1,
        byteCount: 12,
        truncated: false,
      },
      previewDurationMs: 80,
    };
    const running = chartBuilderReducer(initial, {
      type: 'PREVIEW_STARTED',
      requestId: 2,
      scope: { kind: 'STEP', stage: 'FILTER' },
      startedAt: 100,
    });
    const next = chartBuilderReducer(running, {
      type: 'PREVIEW_SUCCEEDED',
      requestId: 2,
      scope: { kind: 'STEP', stage: 'FILTER' },
      result: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' }],
        rows: [['east']],
        rowCount: 1,
        byteCount: 12,
        truncated: false,
      },
      durationMs: 42,
    });

    expect(next.preview?.rows).toEqual([['east']]);
    expect(next.previewScope).toEqual({ kind: 'STEP', stage: 'FILTER' });
    expect(next.previewDurationMs).toBe(42);
    expect(next.draft.outputSchema).toEqual(initial.draft.outputSchema);
  });

  it('records a successful step preview independently from full preview state', () => {
    const running = chartBuilderReducer(createInitialChartBuilderState(), {
      type: 'PREVIEW_STARTED',
      requestId: 1,
      scope: { kind: 'STEP', stage: 'DATA' },
      startedAt: 100,
    });
    const next = chartBuilderReducer(running, {
      type: 'PREVIEW_SUCCEEDED',
      requestId: 1,
      scope: { kind: 'STEP', stage: 'DATA' },
      result: {
        columns: [{ name: 'region', type: 'STRING', family: 'STRING' }],
        rows: [],
        rowCount: 0,
        byteCount: 0,
        truncated: false,
      },
      durationMs: 10,
    });

    expect(next.previewStatus).toBe('SUCCEEDED');
    expect(next.previewScope).toEqual({ kind: 'STEP', stage: 'DATA' });
  });
});
