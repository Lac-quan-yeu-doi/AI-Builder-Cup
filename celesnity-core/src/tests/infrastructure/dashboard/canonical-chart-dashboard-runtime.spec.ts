import type { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import {
  CanonicalChartDashboardCardExecutor,
  relativeDateRange,
} from '@infrastructure/dashboard/canonical-chart-dashboard-card.executor';
import { CanonicalChartFilterTargetReader } from '@infrastructure/dashboard/canonical-chart-filter-target.reader';

const principal = { organizationId: 'org-1', identityId: 'identity-1', isOrganizationAdmin: false };

describe('canonical chart dashboard runtime adapters', () => {
  it('maps native filter targets to runtime parameter values and collects rows', async () => {
    const runtime = {
      previewQuery: jest.fn().mockResolvedValue({ runId: 'run-1', stream: events() }),
    };
    const executor = new CanonicalChartDashboardCardExecutor(
      repository(nativeRevision()),
      runtime as unknown as ChartRuntimeUseCases,
      { requireAccess: jest.fn() },
    );
    const result = await executor.execute({
      principal,
      chartId: 'chart-1',
      revisionNumber: null,
      filters: [
        {
          filterId: 'filter-1',
          operator: 'IS',
          target: { kind: 'NATIVE_QUERY_VARIABLE', variableKey: 'region' },
          value: 'EU',
        },
      ],
    });
    expect(runtime.previewQuery).toHaveBeenCalledWith(
      expect.objectContaining({ parameterValues: { region: 'EU' } }),
    );
    expect(result).toEqual({
      state: 'SUCCESS',
      result: expect.objectContaining({ runId: 'run-1', rowCount: 1, rows: [['EU']] }),
    });
  });

  it('exposes authorized stable targets without SQL', async () => {
    const reader = new CanonicalChartFilterTargetReader(repository(nativeRevision()), {
      requireAccess: jest.fn(),
    });
    await expect(
      reader.list({ principal, cards: [{ cardId: 'card-1', chartId: 'chart-1' }] }),
    ).resolves.toEqual([
      {
        cardId: 'card-1',
        targets: [
          { kind: 'NATIVE_QUERY_VARIABLE', variableKey: 'region', semanticType: 'TEXT_CATEGORY' },
        ],
      },
    ]);
  });

  it('exposes breakout fields and applies time grouping without adding a row predicate', async () => {
    const value = visualRevision();
    const reader = new CanonicalChartFilterTargetReader(repository(value), {
      requireAccess: jest.fn(),
    });
    await expect(
      reader.list({ principal, cards: [{ cardId: 'card-1', chartId: 'chart-1' }] }),
    ).resolves.toEqual([
      expect.objectContaining({
        cardId: 'card-1',
        targets: expect.arrayContaining([
          { kind: 'FIELD', fieldId: 'orders.created_at', semanticType: 'DATE_PICKER' },
        ]),
      }),
    ]);

    const runtime = {
      previewQuery: jest.fn().mockResolvedValue({ runId: 'run-1', stream: events() }),
    };
    const executor = new CanonicalChartDashboardCardExecutor(
      repository(value),
      runtime as unknown as ChartRuntimeUseCases,
      { requireAccess: jest.fn() },
    );
    await executor.execute({
      principal,
      chartId: 'chart-1',
      revisionNumber: null,
      filters: [
        {
          filterId: 'filter-1',
          operator: 'DAY',
          target: { kind: 'FIELD', fieldId: 'orders.created_at' },
          value: 'MONTH',
        },
      ],
    });

    expect(runtime.previewQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryDefinition: expect.objectContaining({
          filters: [],
          breakouts: [
            {
              kind: 'CALL',
              function: 'date_trunc',
              arguments: [
                { kind: 'LITERAL', valueType: 'STRING', value: 'month' },
                { kind: 'FIELD', relation: 'orders', field: 'created_at' },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('expands multiple category values into a safe visual OR expression', async () => {
    const runtime = {
      previewQuery: jest.fn().mockResolvedValue({ runId: 'run-1', stream: events() }),
    };
    const executor = new CanonicalChartDashboardCardExecutor(
      repository(visualRevision()),
      runtime as unknown as ChartRuntimeUseCases,
      { requireAccess: jest.fn() },
    );

    await executor.execute({
      principal,
      chartId: 'chart-1',
      revisionNumber: null,
      filters: [
        {
          filterId: 'filter-1',
          operator: 'IS',
          target: { kind: 'FIELD', fieldId: 'orders.id' },
          value: ['A', 'B'],
        },
      ],
    });

    expect(runtime.previewQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryDefinition: expect.objectContaining({
          filters: [
            expect.objectContaining({
              kind: 'BINARY',
              operator: 'OR',
            }),
          ],
        }),
      }),
    );
  });

  it('resolves relative date presets into deterministic UTC ranges', () => {
    const now = new Date('2026-09-07T12:30:00.000Z');
    expect(relativeDateRange('TODAY', now)).toEqual(['2026-09-07', '2026-09-07']);
    expect(relativeDateRange('PREVIOUS_7_DAYS', now)).toEqual(['2026-09-01', '2026-09-07']);
    expect(relativeDateRange('PREVIOUS_MONTH', now)).toEqual(['2026-08-01', '2026-08-31']);
  });
});

async function* events() {
  yield {
    type: 'COLUMNS' as const,
    columns: [{ name: 'region', type: 'varchar', family: 'STRING' as const }],
  };
  yield { type: 'ROWS' as const, rows: [['EU']] };
  yield { type: 'SUCCEEDED' as const, rowCount: 1, byteCount: 4, truncated: false };
}

function nativeRevision() {
  return {
    chart: {
      id: 'chart-1',
      organizationId: 'org-1',
      collectionId: 'collection-1',
      archivedAt: null,
    },
    revision: {
      revisionNumber: 1,
      queryDefinition: {
        schemaVersion: 1 as const,
        mode: 'NATIVE' as const,
        context: { catalog: 'iceberg', schema: 'public' },
        parameters: [{ name: 'region', type: 'STRING' as const, required: false }],
        sql: 'select 1',
      },
      outputSchema: [],
    },
  };
}

function visualRevision() {
  return {
    chart: {
      id: 'chart-1',
      organizationId: 'org-1',
      collectionId: 'collection-1',
      archivedAt: null,
    },
    revision: {
      revisionNumber: 1,
      queryDefinition: {
        schemaVersion: 1 as const,
        mode: 'VISUAL' as const,
        context: { catalog: 'iceberg', schema: 'public' },
        parameters: [],
        source: {
          table: { catalog: 'iceberg', schema: 'public', table: 'orders' },
          alias: 'orders',
        },
        joins: [],
        projections: [],
        customExpressions: [],
        filters: [],
        aggregations: [
          {
            alias: 'count',
            function: 'COUNT',
            expression: { kind: 'FIELD' as const, relation: 'orders', field: 'id' },
          },
        ],
        breakouts: [{ kind: 'FIELD' as const, relation: 'orders', field: 'created_at' }],
        postAggregationFilters: [],
        orderBy: [],
      },
      outputSchema: [{ name: 'breakout_1', type: 'timestamp', family: 'TIMESTAMP' as const }],
    },
  };
}

function repository(value: { readonly revision: unknown }): ICanonicalChartRepository {
  return {
    findCanonicalById: jest.fn().mockResolvedValue(value),
    listRevisions: jest.fn().mockResolvedValue([value.revision]),
    createCanonical: jest.fn(),
    updateCanonical: jest.fn(),
    restoreRevision: jest.fn(),
    listCanonical: jest.fn(),
    moveCanonical: jest.fn(),
    archiveCanonical: jest.fn(),
  };
}
