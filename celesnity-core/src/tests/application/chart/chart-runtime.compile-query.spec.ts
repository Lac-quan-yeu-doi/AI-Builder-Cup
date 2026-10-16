import { ChartRuntimeUseCases } from '@application/chart/chart-runtime.use-cases';
import type { ChartActor } from '@application/chart/chart-authoring.use-cases';
import type { ChartRunRegistry } from '@application/chart/chart-run.registry';
import type { IAnalyticalQueryExecutor } from '@application/chart/interfaces/i-analytical-query-executor';
import type { ICanonicalChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { IChartCatalog } from '@application/chart/interfaces/i-chart-catalog';
import type { INativeChartQueryPolicy } from '@application/chart/interfaces/i-native-chart-query-policy';
import type { IQueryTargetResolver } from '@application/query-workbench/interfaces/i-query-target-resolver';
import type { VisualQueryCompiler } from '@application/chart/query/visual-query.compiler';
import type { CompiledChartQuery } from '@application/chart/query/compiled-chart-query';
import type { QueryDefinition } from '@domain/chart/models/query-definition';

const actor: ChartActor = {
  organizationId: 'org-1',
  identityId: 'identity-1',
};

const visualQuery: QueryDefinition = {
  schemaVersion: 1,
  mode: 'VISUAL',
  context: { catalog: 'iceberg', schema: 'kasadata' },
  parameters: [],
  source: {
    table: { catalog: 'iceberg', schema: 'kasadata', table: 'orders' },
    alias: 'source',
  },
  joins: [],
  projections: [
    {
      alias: 'status',
      expression: { kind: 'FIELD', relation: 'source', field: 'status' },
    },
  ],
  customExpressions: [],
  filters: [],
  aggregations: [],
  breakouts: [],
  postAggregationFilters: [],
  orderBy: [],
};

const compiled: CompiledChartQuery = {
  sql: 'SELECT "source"."status" FROM "iceberg"."kasadata"."orders" AS "source"',
  context: { catalog: 'iceberg', schema: 'kasadata' },
  queryHash: 'query-hash',
  relations: [{ catalog: 'iceberg', schema: 'kasadata', table: 'orders' }],
  outputAliases: ['status'],
};

function makeRuntime(options?: { readonly rejectAuthorization?: boolean }) {
  const repository = {} as ICanonicalChartRepository;
  const visualCompiler = {
    compile: jest.fn().mockReturnValue(compiled),
  } as unknown as VisualQueryCompiler;
  const nativePolicy = {} as INativeChartQueryPolicy;
  const targetResolver = {} as IQueryTargetResolver;
  const catalog = {
    resolveAndAuthorize: options?.rejectAuthorization
      ? jest.fn().mockRejectedValue(new Error('forbidden'))
      : jest
          .fn()
          .mockResolvedValue(
            compiled.relations.map((table) => ({ table, fingerprint: 'fingerprint' })),
          ),
  } as unknown as IChartCatalog;
  const executor = { execute: jest.fn() } as unknown as IAnalyticalQueryExecutor;
  const registry = {} as ChartRunRegistry;

  return {
    runtime: new ChartRuntimeUseCases(
      repository,
      visualCompiler,
      nativePolicy,
      targetResolver,
      catalog,
      executor,
      registry,
    ),
    catalog,
    executor,
  };
}

describe('ChartRuntimeUseCases.compileQuery', () => {
  it('returns the authorized compiled query without executing it', async () => {
    const { runtime, catalog, executor } = makeRuntime();

    await expect(
      runtime.compileQuery({ actor, queryDefinition: visualQuery, parameterValues: {} }),
    ).resolves.toEqual(compiled);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(catalog.resolveAndAuthorize).toHaveBeenCalledWith({
      actor,
      relations: compiled.relations,
    });
  });

  it('fails closed when catalog authorization rejects', async () => {
    const { runtime, executor } = makeRuntime({ rejectAuthorization: true });

    await expect(
      runtime.compileQuery({ actor, queryDefinition: visualQuery, parameterValues: {} }),
    ).rejects.toThrow('forbidden');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
