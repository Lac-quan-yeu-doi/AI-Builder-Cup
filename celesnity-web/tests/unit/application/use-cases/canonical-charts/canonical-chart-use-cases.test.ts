import { describe, expect, it, vi } from 'vitest';

import type { CanonicalChartRepository } from '@/src/application/repositories/canonical-chart.repository.interface';
import { createPreviewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart.use-case';
import { createPreviewCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/preview-canonical-chart-query.use-case';
import { createCancelCanonicalChartRunUseCase } from '@/src/application/use-cases/canonical-charts/cancel-canonical-chart-run.use-case';
import { createSaveAsNewCanonicalChartUseCase } from '@/src/application/use-cases/canonical-charts/save-as-new-canonical-chart.use-case';
import { createCompileCanonicalChartQueryUseCase } from '@/src/application/use-cases/canonical-charts/compile-canonical-chart-query.use-case';
import { createRestoreCanonicalChartRevisionUseCase } from '@/src/application/use-cases/canonical-charts/restore-canonical-chart-revision.use-case';
import type { ChartDraft } from '@/src/entities/models/canonical-chart';

const draft: ChartDraft = {
  title: '  Revenue by region  ',
  description: null,
  collectionId: 'collection-1',
  queryDefinition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  },
  visualizationDefinition: {
    schemaVersion: 1,
    type: 'PIE',
    roles: { measure: 'revenue', breakout: 'region' },
    display: {},
  },
  outputSchema: [],
  parameterValues: {},
};

describe('preview canonical chart', () => {
  it('normalizes the draft title before it reaches Core', async () => {
    const repository: CanonicalChartRepository = {
      previewQuery: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        runId: 'run-1',
        columns: [],
        rows: [],
        rowCount: 0,
        byteCount: 0,
        truncated: false,
        proof: null,
      }),
      compileQuery: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      runSaved: vi.fn(),
      archive: vi.fn(),
    };

    await createPreviewCanonicalChartUseCase(repository)(draft);

    expect(repository.preview).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Revenue by region' }),
    );
  });

  it('previews only the query definition before visualization roles exist', async () => {
    const previewQuery = vi.fn().mockResolvedValue({
      runId: 'run-query-1',
      columns: [],
      rows: [],
      rowCount: 0,
      byteCount: 0,
      truncated: false,
      proof: null,
    });
    const repository = { previewQuery } as unknown as CanonicalChartRepository;

    await createPreviewCanonicalChartQueryUseCase(repository)({
      queryDefinition: draft.queryDefinition,
      parameterValues: {},
    });

    expect(previewQuery).toHaveBeenCalledWith({
      queryDefinition: draft.queryDefinition,
      parameterValues: {},
    });
  });

  it('cancels a run with both chart and run scope', async () => {
    const cancelRun = vi.fn().mockResolvedValue(undefined);
    const repository = {
      preview: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      runSaved: vi.fn(),
      archive: vi.fn(),
      cancelRun,
    } as unknown as CanonicalChartRepository;

    await createCancelCanonicalChartRunUseCase(repository)({
      chartId: ' chart-1 ',
      runId: ' run-1 ',
    });

    expect(cancelRun).toHaveBeenCalledWith({ chartId: 'chart-1', runId: 'run-1' });
  });

  it('saves a valid draft as a new chart', async () => {
    const saveAsNew = vi.fn().mockResolvedValue({ id: 'chart-2' });
    const repository = {
      preview: vi.fn(),
      create: vi.fn(),
      saveAsNew,
      get: vi.fn(),
      runSaved: vi.fn(),
      archive: vi.fn(),
    } as unknown as CanonicalChartRepository;

    await createSaveAsNewCanonicalChartUseCase(repository)(draft);

    expect(saveAsNew).toHaveBeenCalledWith(draft);
  });
});

describe('compile canonical chart query', () => {
  it('delegates a typed query definition to the repository without adding preview data', async () => {
    const compileQuery = vi.fn().mockResolvedValue({
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
    });
    const repository = {
      compileQuery,
    } as unknown as CanonicalChartRepository;
    const queryDefinition = {
      schemaVersion: 1 as const,
      mode: 'VISUAL' as const,
      context: { catalog: 'iceberg', schema: 'kasadata' },
      parameters: [],
      source: {
        table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
        alias: 'orders',
      },
      joins: [],
      projections: [],
      customExpressions: [],
      filters: [],
      aggregations: [],
      breakouts: [],
      postAggregationFilters: [],
      orderBy: [],
    };

    await expect(
      createCompileCanonicalChartQueryUseCase(repository)({
        queryDefinition,
        parameterValues: {},
      }),
    ).resolves.toEqual({
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
    });
    expect(compileQuery).toHaveBeenCalledWith({ queryDefinition, parameterValues: {} });
  });
});

describe('restore canonical chart revision', () => {
  it('restores an older version against the current version', async () => {
    const restoreRevision = vi.fn().mockResolvedValue({ id: 'chart-1', currentRevisionNumber: 5 });
    const repository = { restoreRevision } as unknown as CanonicalChartRepository;

    await createRestoreCanonicalChartRevisionUseCase(repository)({
      chartId: ' chart-1 ',
      revisionNumber: 2,
      expectedRevision: 4,
    });

    expect(restoreRevision).toHaveBeenCalledWith({
      chartId: 'chart-1',
      revisionNumber: 2,
      expectedRevision: 4,
    });
  });

  it('does not restore the current version', async () => {
    const repository = { restoreRevision: vi.fn() } as unknown as CanonicalChartRepository;

    expect(() =>
      createRestoreCanonicalChartRevisionUseCase(repository)({
        chartId: 'chart-1',
        revisionNumber: 4,
        expectedRevision: 4,
      }),
    ).toThrow('The current chart version cannot be restored.');
  });
});
