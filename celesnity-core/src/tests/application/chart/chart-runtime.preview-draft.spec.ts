import { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import type { ChartRunRegistry } from '@application/chart/chart-run.registry';
import type { IAnalyticalQueryExecutor } from '@application/chart/interfaces/i-analytical-query-executor';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { INativeChartQueryPolicy } from '@application/chart/interfaces/i-native-chart-query-policy';
import type { IQueryTargetResolver } from '@application/query-workbench/interfaces/i-query-target-resolver';
import type { QueryDefinition } from '@domain/chart/models/query-definition';

const actor = { organizationId: 'org-1', identityId: 'identity-1' };
const queryDefinition: QueryDefinition = {
  schemaVersion: 1,
  mode: 'VISUAL',
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  source: {
    table: { catalog: 'iceberg', schema: 'analytics', table: 'orders' },
    alias: 'orders',
  },
  joins: [],
  projections: [
    {
      alias: 'status',
      expression: { kind: 'FIELD', relation: 'orders', field: 'status' },
    },
  ],
  customExpressions: [],
  filters: [],
  aggregations: [],
  breakouts: [],
  postAggregationFilters: [],
  orderBy: [],
};
const compiled = {
  sql: 'SELECT "orders"."status" FROM "iceberg"."analytics"."orders" AS "orders"',
  context: { catalog: 'iceberg', schema: 'analytics' },
  queryHash: 'query-hash',
  relations: [{ catalog: 'iceberg', schema: 'analytics', table: 'orders' }],
  outputAliases: ['status'],
};

describe('ChartRuntimeUseCases.previewChartDraft', () => {
  it('executes and validates a transient draft without a collection', async () => {
    const events = (async function* () {
      yield {
        type: 'COLUMNS' as const,
        columns: [{ name: 'status', type: 'varchar', family: 'STRING' as const }],
      };
      yield { type: 'ROWS' as const, rows: [['paid']] };
      yield { type: 'SUCCEEDED' as const, rowCount: 1, byteCount: 8, truncated: false };
    })();
    const executor = {
      execute: jest.fn().mockReturnValue(events),
    } as unknown as IAnalyticalQueryExecutor;
    const registry = {
      register: jest.fn().mockReturnValue({
        runId: 'run-1',
        signal: new AbortController().signal,
      }),
      complete: jest.fn(),
    } as unknown as ChartRunRegistry;
    const runtime = new ChartRuntimeUseCases(
      {} as ICanonicalChartRepository,
      { compile: jest.fn().mockReturnValue(compiled) },
      {} as INativeChartQueryPolicy,
      {} as IQueryTargetResolver,
      {
        resolveAndAuthorize: jest.fn().mockResolvedValue([
          {
            table: compiled.relations[0],
            fingerprint: 'fingerprint',
          },
        ]),
      },
      executor,
      registry,
    );

    const preview = await runtime.previewChartDraft({
      actor,
      draft: {
        title: 'Orders by status',
        description: null,
        queryDefinition,
        visualizationDefinition: {
          schemaVersion: 1,
          type: 'TABLE',
          roles: { columns: ['status'] },
          display: {},
        },
        outputSchema: [],
        parameterValues: {},
      },
    });

    const received = [];
    for await (const event of preview.stream) received.push(event);

    expect(received).toEqual([
      {
        type: 'COLUMNS',
        columns: [{ name: 'status', type: 'varchar', family: 'STRING' }],
      },
      { type: 'ROWS', rows: [['paid']] },
      { type: 'SUCCEEDED', rowCount: 1, byteCount: 8, truncated: false },
    ]);
  });
});
