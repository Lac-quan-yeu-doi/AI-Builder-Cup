import { QueryWorkbenchUseCases } from '@application/query-workbench/query-workbench.use-cases';
import type { ISqlExecutionRepository } from '@application/query-workbench/interfaces/i-sql-execution-repository';
import type { ISqlExecutionReader } from '@application/query-workbench/interfaces/i-sql-execution-reader';
import type { IQueryResultStore } from '@application/query-workbench/interfaces/i-query-result-store';
import type { QueryExecutionRunner } from '@application/query-workbench/query-execution.runner';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { CatalogAccessAuthorizer } from '@application/catalog-exploration/catalog-access-authorizer';
import type {
  IQueryTargetResolver,
  IQueryTargetMetadata,
  QueryTableTarget,
} from '@application/query-workbench/interfaces/i-query-target-resolver';
import type { IColumnProfileCache } from '@application/catalog-exploration/interfaces/i-column-profile-cache';
import { ColumnProfile } from '@domain/catalog-exploration/models/catalog-models';

const repository: ISqlExecutionRepository = {
  create: () => Promise.resolve(),
  findById: () => Promise.resolve(undefined),
  updateStatus: () => Promise.resolve(true),
};

const reader: ISqlExecutionReader = {
  listHistory: () => Promise.resolve([]),
  findById: () => Promise.resolve(undefined),
};

const resultStore: IQueryResultStore = {
  save: () => undefined,
  get: () => undefined,
  delete: () => undefined,
};

const runner = { schedule: () => undefined } as unknown as QueryExecutionRunner;

const unitOfWork: IUnitOfWork = {
  commit: (work) => work({ record: () => undefined }),
};

const clock: IClock = { now: () => new Date('2026-09-03T00:00:00.000Z') };
const idGenerator: IIdGenerator = { next: () => '11111111-1111-4111-8111-111111111111' };

const allowAll: CatalogAccessAuthorizer = {
  authorizeCatalog: () =>
    Promise.resolve({ allowed: true, matchedGrantIds: ['test'], reason: 'EXPLICIT_ALLOW' }),
};

const ORDERS_TARGET: QueryTableTarget = {
  catalog: 'iceberg',
  schema: 'analytics',
  table: 'orders',
};

const targets: IQueryTargetResolver = {
  resolve: () => [ORDERS_TARGET],
};

const metadata: IQueryTargetMetadata = {
  columns: () => Promise.resolve([]),
};

function buildUseCases(columnProfileCache?: IColumnProfileCache): QueryWorkbenchUseCases {
  return new QueryWorkbenchUseCases(
    repository,
    reader,
    resultStore,
    runner,
    unitOfWork,
    clock,
    idGenerator,
    'iceberg',
    allowAll,
    targets,
    metadata,
    columnProfileCache,
  );
}

function cacheWith(profiles: readonly ColumnProfile[]): IColumnProfileCache {
  const store = new Map<string, readonly ColumnProfile[]>([['iceberg.analytics.orders', profiles]]);
  return {
    get: (key) => store.get(key),
    set: () => undefined,
  };
}

describe('QueryWorkbenchUseCases.submit — value-suggestion warnings', () => {
  it('surfaces a suggestion when a filter literal misses a cached profiled value', async () => {
    const regionProfile = ColumnProfile.create({
      name: 'region',
      dataType: 'varchar',
      kind: 'string',
      topValues: ['California', 'Texas', 'Nevada'],
      computedAt: '2026-09-03T00:00:00.000Z',
    });
    const useCases = buildUseCases(cacheWith([regionProfile]));

    const result = await useCases.submit({
      sql: "SELECT * FROM orders WHERE region = 'Calfornia'",
    });

    expect(result.warnings.some((message) => message.includes('California'))).toBe(true);
  });

  it('does not surface a value-suggestion warning when nothing is cached for the target table', async () => {
    const useCases = buildUseCases();

    const result = await useCases.submit({
      sql: "SELECT * FROM orders WHERE region = 'Calfornia'",
    });

    expect(result.warnings.some((message) => message.includes('Calfornia'))).toBe(false);
  });
});
